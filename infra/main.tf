# The demo deployment (ADR-0017), all on free tiers: the API on Cloud Run (scales to zero), jobs on
# Cloud Tasks and Scheduler, secrets in Secret Manager, the image in
# Artifact Registry. Supabase (database and sign-in) is hosted separately, on its free plan.

data "google_project" "this" {}

locals {
  # Cloud Run's address is predictable, so the API can be told its own address (for Bluesky's
  # client details and email links) before it exists.
  public_api_url = "https://${var.service_name}-${data.google_project.this.number}.${var.region}.run.app"

  # Only the names: the values are added with gcloud, so they never appear in Terraform's state.
  secrets = ["supabase-secret-key", "database-url", "token-encryption-keys", "smtp-url"]
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  repository_id = "calm-guardian"
  location      = var.region
  format        = "DOCKER"
  description   = "Calm Guardian API images."
  depends_on    = [google_project_service.apis]
}

resource "google_secret_manager_secret" "api" {
  for_each  = toset(local.secrets)
  secret_id = each.value
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

# Background work goes through Cloud Tasks and Cloud Scheduler (ADR-0015, ADR-0017), so Cloud Run can
# scale to zero: everything here stays within GCP's free tier for a demo.
resource "google_cloud_tasks_queue" "jobs" {
  name     = "calm-guardian-jobs"
  location = var.region

  rate_limits {
    # Well under Bluesky's limits, and plenty for a demo.
    max_dispatches_per_second = 5
    max_concurrent_dispatches = 5
  }

  retry_config {
    max_attempts  = 10
    min_backoff   = "5s"
    max_backoff   = "300s"
    max_doublings = 6
  }

  depends_on = [google_project_service.apis]
}

# Cloud Tasks and Cloud Scheduler sign their requests as this account; /internal/* accepts no other.
resource "google_service_account" "tasks_invoker" {
  account_id   = "calm-guardian-tasks"
  display_name = "Calm Guardian background jobs"
}

# The API runs as its own account, which can read its secrets and nothing else.
resource "google_service_account" "api" {
  account_id   = "calm-guardian-api"
  display_name = "Calm Guardian API"
}

resource "google_secret_manager_secret_iam_member" "api_reads_secrets" {
  for_each  = google_secret_manager_secret.api
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

# The API may queue jobs, signed as the invoker account.
resource "google_cloud_tasks_queue_iam_member" "api_enqueues" {
  name     = google_cloud_tasks_queue.jobs.name
  location = var.region
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${google_service_account.api.email}"
}

resource "google_service_account_iam_member" "api_signs_as_invoker" {
  service_account_id = google_service_account.tasks_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  count    = var.image == "" ? 0 : 1
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # A demo: easy to tear down. Flip this before relying on it.
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    # Scales to zero between requests: the free tier (ADR-0017). Background work arrives as requests.
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    # A job slice works for up to 8 minutes (ADR-0015); this leaves room to finish it.
    timeout = "900s"

    containers {
      image = var.image

      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "LOG_LEVEL"
        value = "info"
      }
      env {
        name  = "SUPABASE_URL"
        value = var.supabase_url
      }
      env {
        name  = "PUBLIC_API_URL"
        value = local.public_api_url
      }
      env {
        name  = "APP_CONNECT_RETURN_URL"
        value = "calmguardian://connect/bluesky"
      }
      env {
        name  = "EMAIL_FROM"
        value = var.email_from
      }
      env {
        name  = "CLOUD_TASKS_QUEUE"
        value = google_cloud_tasks_queue.jobs.id
      }
      env {
        name  = "TASKS_INVOKER_EMAIL"
        value = google_service_account.tasks_invoker.email
      }

      dynamic "env" {
        for_each = {
          SUPABASE_SECRET_KEY   = "supabase-secret-key"
          DATABASE_URL          = "database-url"
          TOKEN_ENCRYPTION_KEYS = "token-encryption-keys"
          SMTP_URL              = "smtp-url"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.api[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
        }
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.api_reads_secrets]
}

# The API is public: every request that matters needs a signed-in user's token (ADR-0002).
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.image == "" ? 0 : 1
  name     = google_cloud_run_v2_service.api[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# The Sweep: every few minutes, hide posts made while Calm Mode is on (M4). One of the three free
# Cloud Scheduler jobs.
resource "google_cloud_scheduler_job" "sweep" {
  count     = var.image == "" ? 0 : 1
  name      = "calm-guardian-sweep"
  region    = var.region
  schedule  = "*/5 * * * *"
  time_zone = "Etc/UTC"

  http_target {
    http_method = "POST"
    uri         = "${local.public_api_url}/internal/sweep"
    oidc_token {
      service_account_email = google_service_account.tasks_invoker.email
      audience              = local.public_api_url
    }
  }

  depends_on = [google_project_service.apis]
}
