output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC."
  value       = aws_vpc.this.cidr_block
}

output "azs" {
  description = "Availability Zones used."
  value       = local.azs
}

output "public_subnet_ids" {
  description = "Public subnet IDs (for the ALB)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (for ECS tasks and RDS)."
  value       = aws_subnet.private[*].id
}

output "private_route_table_ids" {
  description = "Private route table IDs."
  value       = aws_route_table.private[*].id
}

output "nat_gateway_public_ips" {
  description = "Public IPs that outbound traffic from private subnets comes from."
  value       = aws_eip.nat[*].public_ip
}
