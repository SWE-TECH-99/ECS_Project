# -----------------------------------------------------------------------------
# VPC module
#
# Builds this layout (example with az_count = 2, cidr_block = 10.0.0.0/16):
#
#   VPC 10.0.0.0/16
#   ├── AZ a
#   │   ├── public  10.0.0.0/24   -> route 0.0.0.0/0 to Internet Gateway
#   │   └── private 10.0.10.0/24  -> route 0.0.0.0/0 to NAT Gateway
#   └── AZ b
#       ├── public  10.0.1.0/24
#       └── private 10.0.11.0/24
#
# Public subnets hold things the internet must reach (ALB, NAT gateways).
# Private subnets hold ECS tasks and RDS. They can call out through NAT,
# but nothing on the internet can open a connection to them.
# -----------------------------------------------------------------------------

# Ask AWS which AZs exist in the current region, so the module works anywhere.
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # cidrsubnet(prefix, newbits, netnum) carves a smaller range out of the VPC.
  # /16 + 8 bits = /24 subnets (256 addresses each).
  public_subnet_cidrs  = [for i in range(var.az_count) : cidrsubnet(var.cidr_block, 8, i)]
  private_subnet_cidrs = [for i in range(var.az_count) : cidrsubnet(var.cidr_block, 8, i + 10)]

  nat_gateway_count = var.single_nat_gateway ? 1 : var.az_count
}

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------

resource "aws_vpc" "this" {
  cidr_block = var.cidr_block

  # Both needed so private DNS names resolve (required by interface endpoints).
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, { Name = var.name })
}

# Internet Gateway: the VPC's door to the internet. Only public subnets route to it.
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-igw" })
}

# -----------------------------------------------------------------------------
# Subnets
# -----------------------------------------------------------------------------

resource "aws_subnet" "public" {
  count = var.az_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.name}-public-${local.azs[count.index]}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count = var.az_count

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(var.tags, {
    Name = "${var.name}-private-${local.azs[count.index]}"
    Tier = "private"
  })
}

# -----------------------------------------------------------------------------
# Public routing: one route table shared by all public subnets
# -----------------------------------------------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(var.tags, { Name = "${var.name}-public" })
}

resource "aws_route_table_association" "public" {
  count = var.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# -----------------------------------------------------------------------------
# NAT gateways: let private subnets reach the internet (pull images, call APIs)
# NAT gateways cost money every hour, so dev uses one and prod uses one per AZ.
# -----------------------------------------------------------------------------

# Each NAT gateway needs a static public IP (Elastic IP).
resource "aws_eip" "nat" {
  count = local.nat_gateway_count

  domain = "vpc"

  tags = merge(var.tags, { Name = "${var.name}-nat-${local.azs[count.index]}" })
}

# NAT gateways live in PUBLIC subnets, because they need the Internet Gateway.
resource "aws_nat_gateway" "this" {
  count = local.nat_gateway_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, { Name = "${var.name}-nat-${local.azs[count.index]}" })

  depends_on = [aws_internet_gateway.this]
}

# -----------------------------------------------------------------------------
# Private routing: one route table per AZ, so each AZ can use its own NAT
# -----------------------------------------------------------------------------

resource "aws_route_table" "private" {
  count = var.az_count

  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    # Single NAT: every AZ uses NAT 0. Per-AZ NAT: AZ i uses NAT i.
    nat_gateway_id = aws_nat_gateway.this[var.single_nat_gateway ? 0 : count.index].id
  }

  tags = merge(var.tags, { Name = "${var.name}-private-${local.azs[count.index]}" })
}

resource "aws_route_table_association" "private" {
  count = var.az_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# -----------------------------------------------------------------------------
# VPC endpoints: reach AWS services without going through NAT
# -----------------------------------------------------------------------------

# Gateway endpoint for S3: free. Adds a route to the private route tables.
# ECR stores image layers in S3, so this cuts NAT data charges on every pull.
data "aws_vpc_endpoint_service" "s3" {
  count = var.enable_s3_endpoint ? 1 : 0

  service      = "s3"
  service_type = "Gateway"
}

resource "aws_vpc_endpoint" "s3" {
  count = var.enable_s3_endpoint ? 1 : 0

  vpc_id            = aws_vpc.this.id
  service_name      = data.aws_vpc_endpoint_service.s3[0].service_name
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id

  tags = merge(var.tags, { Name = "${var.name}-s3" })
}

# Interface endpoints: a private network interface in each private subnet.
# Charged per hour per AZ, so only create the ones you list.
resource "aws_security_group" "endpoints" {
  count = length(var.interface_endpoints) > 0 ? 1 : 0

  name        = "${var.name}-vpc-endpoints"
  description = "Allow HTTPS from inside the VPC to interface endpoints"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.cidr_block]
  }

  tags = merge(var.tags, { Name = "${var.name}-vpc-endpoints" })
}

data "aws_vpc_endpoint_service" "interface" {
  for_each = toset(var.interface_endpoints)

  service      = each.key
  service_type = "Interface"
}

resource "aws_vpc_endpoint" "interface" {
  for_each = toset(var.interface_endpoints)

  vpc_id              = aws_vpc.this.id
  service_name        = data.aws_vpc_endpoint_service.interface[each.key].service_name
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.endpoints[0].id]
  private_dns_enabled = true # normal AWS hostnames resolve to the endpoint

  tags = merge(var.tags, { Name = "${var.name}-${each.key}" })
}
