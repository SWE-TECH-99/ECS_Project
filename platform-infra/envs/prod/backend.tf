terraform {
  backend "s3" {
    bucket       = "TODO-tfstate-bucket"
    key          = "prod/terraform.tfstate"
    region       = "TODO-region"
    use_lockfile = true
  }
}
