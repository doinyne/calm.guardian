terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  # Local state while it's a one-person demo (ADR-0017). It holds no secrets: secret values are
  # added with gcloud, never through Terraform. Move to a GCS backend before anyone else applies.
}

provider "google" {
  project = var.project_id
  region  = var.region
}
