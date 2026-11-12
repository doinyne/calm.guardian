output "api_url" {
  description = "The API's address: put it in the app's EXPO_PUBLIC_API_URL."
  value       = local.public_api_url
}

output "image_repository" {
  description = "Where to push the API image."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}
