variable "name" {
  description = "Name prefix for all resources, e.g. \"ecs-platform-dev\"."
  type        = string
}

variable "cidr_block" {
  description = "IP range for the whole VPC. A /16 gives 65,536 addresses to split into subnets."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "How many Availability Zones to spread subnets across. 2 is the minimum for an ALB."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2
    error_message = "az_count must be at least 2 (ALB and multi-AZ RDS need two AZs)."
  }
}

variable "single_nat_gateway" {
  description = "true = one shared NAT gateway (cheap, fine for dev). false = one NAT per AZ (resilient, for prod)."
  type        = bool
  default     = true
}

variable "enable_s3_endpoint" {
  description = "Create a free S3 gateway endpoint so S3 traffic (incl. ECR image layers) skips the NAT gateway."
  type        = bool
  default     = true
}

variable "interface_endpoints" {
  description = "AWS services to reach privately via interface endpoints, e.g. [\"ecr.api\", \"ecr.dkr\", \"logs\", \"secretsmanager\"]. Each costs money per hour per AZ."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Extra tags added to every resource."
  type        = map(string)
  default     = {}
}
