terraform {
  backend "s3" {
    bucket       = "TODO-tfstate-bucket"
    key          = "dev/terraform.tfstate"
    region       = "TODO-region"
    use_lockfile = true
  }
}
