# The demo deployment (ADR-0017): the API on Cloud Run, its secrets in Secret Manager, its image in
# Artifact Registry. Supabase (database and sign-in) is hosted separately.

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
    "cloudbuild.googleapis.com",
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

resource "google_cloud_run_v2_service" "api" {
  count    = var.image == "" ? 0 : 1
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # A demo: easy to tear down. Flip this before relying on it.
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    # Background work (hiding posts, the Sweep) runs inside the API for now (ADR-0015, ADR-0017), so
    # exactly one instance stays up with its CPU always on. Cloud Tasks would let it scale to zero.
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    containers {
      image = var.image

      resources {
        cpu_idle = false
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
