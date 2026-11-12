variable "project_id" {
  description = "The GCP project to deploy into."
  type        = string
}

variable "region" {
  description = "Where everything runs. London keeps data in the UK (ADR-0004)."
  type        = string
  default     = "europe-west2"
}

variable "service_name" {
  description = "The Cloud Run service. Its name is part of the API's address."
  type        = string
  default     = "calm-guardian-api"
}

variable "image" {
  description = "The API image to run, e.g. europe-west2-docker.pkg.dev/<project>/calm-guardian/api:<tag>. Empty on the first apply, before an image exists."
  type        = string
  default     = ""
}

variable "supabase_url" {
  description = "The hosted Supabase project's URL, e.g. https://abcdefgh.supabase.co."
  type        = string
}

variable "email_from" {
  description = "Who emails come from. With Gmail's SMTP, that Gmail address, e.g. \"Calm Guardian <you@gmail.com>\"."
  type        = string
}
