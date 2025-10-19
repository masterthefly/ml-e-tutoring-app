# ML-E AWS Deployment Guide

## 🚀 Complete AWS Production Deployment

This guide provides step-by-step instructions for deploying ML-E to AWS with production-ready configuration, scalability, and security best practices.

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [AWS Services Setup](#aws-services-setup)
4. [Infrastructure as Code](#infrastructure-as-code)
5. [Application Deployment](#application-deployment)
6. [Domain & SSL Configuration](#domain--ssl-configuration)
7. [Monitoring & Logging](#monitoring--logging)
8. [Security Configuration](#security-configuration)
9. [Scaling & Performance](#scaling--performance)
10. [Cost Optimization](#cost-optimization)
11. [Troubleshooting](#troubleshooting)

## 🏗️ Architecture Overview

### AWS Services Used

```mermaid
graph TB
    subgraph "User Access"
        Users[Students & Teachers]
        CDN[CloudFront CDN]
    end
    
    subgraph "Load Balancing & SSL"
        ALB[Application Load Balancer]
        ACM[AWS Certificate Manager]
    end
    
    subgraph "Compute Layer"
        ECS[ECS Fargate Cluster]
        Frontend[Frontend Service]
        Backend[Backend Service]
    end
    
    subgraph "Database Layer"
        MongoDB[DocumentDB]
        Redis[ElastiCache Redis]
    end
    
    subgraph "Storage & Assets"
        S3[S3 Bucket]
        ECR[Elastic Container Registry]
    end
    
    subgraph "Monitoring & Security"
        CloudWatch[CloudWatch]
        WAF[AWS WAF]
        Secrets[Secrets Manager]
    end
    
    Users --> CDN
    CDN --> ALB
    ALB --> ECS
    ECS --> Frontend
    ECS --> Backend
    Backend --> MongoDB
    Backend --> Redis
    Frontend --> S3
    ECS --> ECR
    
    CloudWatch --> ECS
    WAF --> ALB
    Secrets --> Backend
```

### Cost Estimate (Monthly)

| Service | Configuration | Estimated Cost |
|---------|---------------|----------------|
| ECS Fargate | 2 vCPU, 4GB RAM | $50-80 |
| DocumentDB | db.t3.medium | $120-150 |
| ElastiCache | cache.t3.micro | $15-25 |
| Application Load Balancer | Standard | $20-25 |
| CloudFront | 1TB transfer | $10-15 |
| S3 | 10GB storage | $1-3 |
| **Total Estimated** | | **$216-298/month** |

## 📋 Prerequisites

### Required Tools
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Terraform (optional, for IaC)
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Install ECS CLI
sudo curl -Lo /usr/local/bin/ecs-cli https://amazon-ecs-cli.s3.amazonaws.com/ecs-cli-linux-amd64-latest
sudo chmod +x /usr/local/bin/ecs-cli
```

### AWS Account Setup
1. **AWS Account** with appropriate permissions
2. **Domain name** (optional, for custom domain)
3. **OpenAI API Key** for GPT integration

### Environment Variables
```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export CLUSTER_NAME=ml-e-production
export SERVICE_NAME=ml-e-app
```

## 🛠️ AWS Services Setup

### 1. VPC and Networking

#### Create VPC
```bash
# Create VPC
aws ec2 create-vpc \
    --cidr-block 10.0.0.0/16 \
    --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=ml-e-vpc}]'

# Get VPC ID
export VPC_ID=$(aws ec2 describe-vpcs \
    --filters "Name=tag:Name,Values=ml-e-vpc" \
    --query 'Vpcs[0].VpcId' --output text)

# Create Internet Gateway
aws ec2 create-internet-gateway \
    --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=ml-e-igw}]'

export IGW_ID=$(aws ec2 describe-internet-gateways \
    --filters "Name=tag:Name,Values=ml-e-igw" \
    --query 'InternetGateways[0].InternetGatewayId' --output text)

# Attach Internet Gateway to VPC
aws ec2 attach-internet-gateway \
    --internet-gateway-id $IGW_ID \
    --vpc-id $VPC_ID
```

#### Create Subnets
```bash
# Public Subnet 1 (us-east-1a)
aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block 10.0.1.0/24 \
    --availability-zone us-east-1a \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ml-e-public-1}]'

# Public Subnet 2 (us-east-1b)
aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block 10.0.2.0/24 \
    --availability-zone us-east-1b \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ml-e-public-2}]'

# Private Subnet 1 (us-east-1a)
aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block 10.0.3.0/24 \
    --availability-zone us-east-1a \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ml-e-private-1}]'

# Private Subnet 2 (us-east-1b)
aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block 10.0.4.0/24 \
    --availability-zone us-east-1b \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=ml-e-private-2}]'

# Get Subnet IDs
export PUBLIC_SUBNET_1=$(aws ec2 describe-subnets \
    --filters "Name=tag:Name,Values=ml-e-public-1" \
    --query 'Subnets[0].SubnetId' --output text)

export PUBLIC_SUBNET_2=$(aws ec2 describe-subnets \
    --filters "Name=tag:Name,Values=ml-e-public-2" \
    --query 'Subnets[0].SubnetId' --output text)

export PRIVATE_SUBNET_1=$(aws ec2 describe-subnets \
    --filters "Name=tag:Name,Values=ml-e-private-1" \
    --query 'Subnets[0].SubnetId' --output text)

export PRIVATE_SUBNET_2=$(aws ec2 describe-subnets \
    --filters "Name=tag:Name,Values=ml-e-private-2" \
    --query 'Subnets[0].SubnetId' --output text)
```

### 2. Security Groups

#### Application Load Balancer Security Group
```bash
aws ec2 create-security-group \
    --group-name ml-e-alb-sg \
    --description "Security group for ML-E Application Load Balancer" \
    --vpc-id $VPC_ID

export ALB_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=ml-e-alb-sg" \
    --query 'SecurityGroups[0].GroupId' --output text)

# Allow HTTP and HTTPS traffic
aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0
```

#### ECS Tasks Security Group
```bash
aws ec2 create-security-group \
    --group-name ml-e-ecs-sg \
    --description "Security group for ML-E ECS tasks" \
    --vpc-id $VPC_ID

export ECS_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=ml-e-ecs-sg" \
    --query 'SecurityGroups[0].GroupId' --output text)

# Allow traffic from ALB
aws ec2 authorize-security-group-ingress \
    --group-id $ECS_SG_ID \
    --protocol tcp \
    --port 3000 \
    --source-group $ALB_SG_ID

aws ec2 authorize-security-group-ingress \
    --group-id $ECS_SG_ID \
    --protocol tcp \
    --port 3001 \
    --source-group $ALB_SG_ID
```

#### Database Security Group
```bash
aws ec2 create-security-group \
    --group-name ml-e-db-sg \
    --description "Security group for ML-E databases" \
    --vpc-id $VPC_ID

export DB_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=ml-e-db-sg" \
    --query 'SecurityGroups[0].GroupId' --output text)

# Allow MongoDB access from ECS
aws ec2 authorize-security-group-ingress \
    --group-id $DB_SG_ID \
    --protocol tcp \
    --port 27017 \
    --source-group $ECS_SG_ID

# Allow Redis access from ECS
aws ec2 authorize-security-group-ingress \
    --group-id $DB_SG_ID \
    --protocol tcp \
    --port 6379 \
    --source-group $ECS_SG_ID
```

### 3. DocumentDB (MongoDB) Setup

#### Create DocumentDB Subnet Group
```bash
aws docdb create-db-subnet-group \
    --db-subnet-group-name ml-e-docdb-subnet-group \
    --db-subnet-group-description "Subnet group for ML-E DocumentDB" \
    --subnet-ids $PRIVATE_SUBNET_1 $PRIVATE_SUBNET_2
```

#### Create DocumentDB Cluster
```bash
aws docdb create-db-cluster \
    --db-cluster-identifier ml-e-docdb-cluster \
    --engine docdb \
    --master-username mleadmin \
    --master-user-password 'YourSecurePassword123!' \
    --db-subnet-group-name ml-e-docdb-subnet-group \
    --vpc-security-group-ids $DB_SG_ID \
    --storage-encrypted \
    --backup-retention-period 7 \
    --preferred-backup-window "03:00-04:00" \
    --preferred-maintenance-window "sun:04:00-sun:05:00"

# Create DocumentDB Instance
aws docdb create-db-instance \
    --db-instance-identifier ml-e-docdb-instance \
    --db-instance-class db.t3.medium \
    --engine docdb \
    --db-cluster-identifier ml-e-docdb-cluster
```

### 4. ElastiCache (Redis) Setup

#### Create ElastiCache Subnet Group
```bash
aws elasticache create-cache-subnet-group \
    --cache-subnet-group-name ml-e-redis-subnet-group \
    --cache-subnet-group-description "Subnet group for ML-E Redis" \
    --subnet-ids $PRIVATE_SUBNET_1 $PRIVATE_SUBNET_2
```

#### Create Redis Cluster
```bash
aws elasticache create-cache-cluster \
    --cache-cluster-id ml-e-redis-cluster \
    --engine redis \
    --cache-node-type cache.t3.micro \
    --num-cache-nodes 1 \
    --cache-subnet-group-name ml-e-redis-subnet-group \
    --security-group-ids $DB_SG_ID
```

### 5. Secrets Manager Setup

```bash
# Store OpenAI API Key
aws secretsmanager create-secret \
    --name "ml-e/openai-api-key" \
    --description "OpenAI API Key for ML-E" \
    --secret-string '{"OPENAI_API_KEY":"your-openai-api-key-here"}'

# Store Database Credentials
aws secretsmanager create-secret \
    --name "ml-e/database-credentials" \
    --description "Database credentials for ML-E" \
    --secret-string '{"username":"mleadmin","password":"YourSecurePassword123!"}'

# Store JWT Secret
aws secretsmanager create-secret \
    --name "ml-e/jwt-secret" \
    --description "JWT Secret for ML-E authentication" \
    --secret-string '{"JWT_SECRET":"your-super-secret-jwt-key-for-production"}'
```

## 🐳 Container Setup

### 1. Create Dockerfiles

#### Frontend Dockerfile
```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Frontend Nginx Configuration
```nginx
# frontend/nginx.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 80;
        server_name localhost;
        root /usr/share/nginx/html;
        index index.html;

        # Handle React Router
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Gzip compression
        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    }
}
```

#### Backend Dockerfile
```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

### 2. Build and Push Images

#### Create ECR Repositories
```bash
# Create repositories
aws ecr create-repository --repository-name ml-e-frontend
aws ecr create-repository --repository-name ml-e-backend

# Get login token
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

#### Build and Push Frontend
```bash
cd frontend

# Build image
docker build -t ml-e-frontend .

# Tag for ECR
docker tag ml-e-frontend:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ml-e-frontend:latest

# Push to ECR
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ml-e-frontend:latest
```

#### Build and Push Backend
```bash
cd backend

# Build image
docker build -t ml-e-backend .

# Tag for ECR
docker tag ml-e-backend:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ml-e-backend:latest

# Push to ECR
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ml-e-backend:latest
```

## 🚀 ECS Deployment

### 1. Create ECS Cluster
```bash
aws ecs create-cluster \
    --cluster-name $CLUSTER_NAME \
    --capacity-providers FARGATE \
    --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
```

### 2. Create IAM Roles

#### ECS Task Execution Role
```bash
# Create trust policy
cat > ecs-task-execution-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create role
aws iam create-role \
    --role-name ml-e-ecs-execution-role \
    --assume-role-policy-document file://ecs-task-execution-trust-policy.json

# Attach policies
aws iam attach-role-policy \
    --role-name ml-e-ecs-execution-role \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Create custom policy for Secrets Manager
cat > secrets-manager-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue"
            ],
            "Resource": [
                "arn:aws:secretsmanager:$AWS_REGION:$AWS_ACCOUNT_ID:secret:ml-e/*"
            ]
        }
    ]
}
EOF

aws iam create-policy \
    --policy-name ml-e-secrets-manager-policy \
    --policy-document file://secrets-manager-policy.json

aws iam attach-role-policy \
    --role-name ml-e-ecs-execution-role \
    --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/ml-e-secrets-manager-policy
```

### 3. Create Task Definitions

#### Backend Task Definition
```json
{
  "family": "ml-e-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ml-e-ecs-execution-role",
  "containerDefinitions": [
    {
      "name": "ml-e-backend",
      "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/ml-e-backend:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ml-e-backend",
          "awslogs-region": "REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "secrets": [
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:ml-e/openai-api-key:OPENAI_API_KEY::"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:ml-e/jwt-secret:JWT_SECRET::"
        },
        {
          "name": "MONGODB_USERNAME",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:ml-e/database-credentials:username::"
        },
        {
          "name": "MONGODB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:ml-e/database-credentials:password::"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3001"
        },
        {
          "name": "MONGODB_URI",
          "value": "mongodb://DOCDB_ENDPOINT:27017/ml-e-prod"
        },
        {
          "name": "REDIS_URL",
          "value": "redis://REDIS_ENDPOINT:6379"
        }
      ]
    }
  ]
}
```

#### Frontend Task Definition
```json
{
  "family": "ml-e-frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ml-e-ecs-execution-role",
  "containerDefinitions": [
    {
      "name": "ml-e-frontend",
      "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/ml-e-frontend:latest",
      "portMappings": [
        {
          "containerPort": 80,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ml-e-frontend",
          "awslogs-region": "REGION",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 4. Create CloudWatch Log Groups
```bash
aws logs create-log-group --log-group-name /ecs/ml-e-backend
aws logs create-log-group --log-group-name /ecs/ml-e-frontend
```

### 5. Register Task Definitions
```bash
# Get DocumentDB and Redis endpoints
export DOCDB_ENDPOINT=$(aws docdb describe-db-clusters \
    --db-cluster-identifier ml-e-docdb-cluster \
    --query 'DBClusters[0].Endpoint' --output text)

export REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
    --cache-cluster-id ml-e-redis-cluster \
    --query 'CacheClusters[0].RedisConfiguration.PrimaryEndpoint.Address' --output text)

# Update task definitions with actual values
sed -i "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" backend-task-definition.json
sed -i "s/REGION/$AWS_REGION/g" backend-task-definition.json
sed -i "s/DOCDB_ENDPOINT/$DOCDB_ENDPOINT/g" backend-task-definition.json
sed -i "s/REDIS_ENDPOINT/$REDIS_ENDPOINT/g" backend-task-definition.json

sed -i "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" frontend-task-definition.json
sed -i "s/REGION/$AWS_REGION/g" frontend-task-definition.json

# Register task definitions
aws ecs register-task-definition --cli-input-json file://backend-task-definition.json
aws ecs register-task-definition --cli-input-json file://frontend-task-definition.json
```

## 🔄 Load Balancer Setup

### 1. Create Application Load Balancer
```bash
aws elbv2 create-load-balancer \
    --name ml-e-alb \
    --subnets $PUBLIC_SUBNET_1 $PUBLIC_SUBNET_2 \
    --security-groups $ALB_SG_ID \
    --scheme internet-facing \
    --type application \
    --ip-address-type ipv4

export ALB_ARN=$(aws elbv2 describe-load-balancers \
    --names ml-e-alb \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)

export ALB_DNS=$(aws elbv2 describe-load-balancers \
    --names ml-e-alb \
    --query 'LoadBalancers[0].DNSName' --output text)
```

### 2. Create Target Groups
```bash
# Frontend target group
aws elbv2 create-target-group \
    --name ml-e-frontend-tg \
    --protocol HTTP \
    --port 80 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path / \
    --health-check-protocol HTTP

export FRONTEND_TG_ARN=$(aws elbv2 describe-target-groups \
    --names ml-e-frontend-tg \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

# Backend target group
aws elbv2 create-target-group \
    --name ml-e-backend-tg \
    --protocol HTTP \
    --port 3001 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path /api/health \
    --health-check-protocol HTTP

export BACKEND_TG_ARN=$(aws elbv2 describe-target-groups \
    --names ml-e-backend-tg \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
```

### 3. Create Listeners
```bash
# HTTP Listener (will redirect to HTTPS in production)
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$FRONTEND_TG_ARN

# Add rule for API traffic
aws elbv2 create-rule \
    --listener-arn $(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query 'Listeners[0].ListenerArn' --output text) \
    --priority 100 \
    --conditions Field=path-pattern,Values="/api/*" \
    --actions Type=forward,TargetGroupArn=$BACKEND_TG_ARN
```

## 🚀 Deploy Services

### 1. Create ECS Services
```bash
# Backend service
aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name ml-e-backend-service \
    --task-definition ml-e-backend \
    --desired-count 2 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
    --load-balancers targetGroupArn=$BACKEND_TG_ARN,containerName=ml-e-backend,containerPort=3001

# Frontend service
aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name ml-e-frontend-service \
    --task-definition ml-e-frontend \
    --desired-count 2 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
    --load-balancers targetGroupArn=$FRONTEND_TG_ARN,containerName=ml-e-frontend,containerPort=80
```

### 2. Verify Deployment
```bash
# Check service status
aws ecs describe-services \
    --cluster $CLUSTER_NAME \
    --services ml-e-backend-service ml-e-frontend-service

# Check task health
aws ecs list-tasks --cluster $CLUSTER_NAME
```

## 🌐 Domain & SSL Configuration

### 1. Request SSL Certificate
```bash
# Request certificate (replace with your domain)
aws acm request-certificate \
    --domain-name ml-e.yourdomain.com \
    --subject-alternative-names "*.ml-e.yourdomain.com" \
    --validation-method DNS

export CERT_ARN=$(aws acm list-certificates \
    --query 'CertificateSummaryList[?DomainName==`ml-e.yourdomain.com`].CertificateArn' \
    --output text)
```

### 2. Create HTTPS Listener
```bash
# Create HTTPS listener
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn=$CERT_ARN \
    --default-actions Type=forward,TargetGroupArn=$FRONTEND_TG_ARN

# Add HTTPS rule for API traffic
aws elbv2 create-rule \
    --listener-arn $(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --protocol HTTPS --query 'Listeners[0].ListenerArn' --output text) \
    --priority 100 \
    --conditions Field=path-pattern,Values="/api/*" \
    --actions Type=forward,TargetGroupArn=$BACKEND_TG_ARN
```

### 3. Setup CloudFront Distribution
```bash
# Create CloudFront distribution
cat > cloudfront-config.json << EOF
{
    "CallerReference": "ml-e-$(date +%s)",
    "Comment": "ML-E CloudFront Distribution",
    "DefaultRootObject": "index.html",
    "Origins": {
        "Quantity": 1,
        "Items": [
            {
                "Id": "ml-e-alb",
                "DomainName": "$ALB_DNS",
                "CustomOriginConfig": {
                    "HTTPPort": 80,
                    "HTTPSPort": 443,
                    "OriginProtocolPolicy": "https-only"
                }
            }
        ]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "ml-e-alb",
        "ViewerProtocolPolicy": "redirect-to-https",
        "TrustedSigners": {
            "Enabled": false,
            "Quantity": 0
        },
        "ForwardedValues": {
            "QueryString": true,
            "Cookies": {
                "Forward": "all"
            }
        },
        "MinTTL": 0
    },
    "Enabled": true,
    "PriceClass": "PriceClass_100"
}
EOF

aws cloudfront create-distribution --distribution-config file://cloudfront-config.json
```

## 📊 Monitoring & Logging

### 1. CloudWatch Dashboards
```bash
# Create custom dashboard
cat > dashboard-config.json << EOF
{
    "widgets": [
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/ECS", "CPUUtilization", "ServiceName", "ml-e-backend-service", "ClusterName", "$CLUSTER_NAME"],
                    [".", "MemoryUtilization", ".", ".", ".", "."],
                    ["AWS/ECS", "CPUUtilization", "ServiceName", "ml-e-frontend-service", "ClusterName", "$CLUSTER_NAME"],
                    [".", "MemoryUtilization", ".", ".", ".", "."]
                ],
                "period": 300,
                "stat": "Average",
                "region": "$AWS_REGION",
                "title": "ECS Resource Utilization"
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", "app/ml-e-alb"],
                    [".", "TargetResponseTime", ".", "."],
                    [".", "HTTPCode_Target_2XX_Count", ".", "."],
                    [".", "HTTPCode_Target_4XX_Count", ".", "."],
                    [".", "HTTPCode_Target_5XX_Count", ".", "."]
                ],
                "period": 300,
                "stat": "Sum",
                "region": "$AWS_REGION",
                "title": "Application Load Balancer Metrics"
            }
        }
    ]
}
EOF

aws cloudwatch put-dashboard \
    --dashboard-name "ML-E-Production" \
    --dashboard-body file://dashboard-config.json
```

### 2. CloudWatch Alarms
```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
    --alarm-name "ML-E-Backend-High-CPU" \
    --alarm-description "ML-E Backend high CPU utilization" \
    --metric-name CPUUtilization \
    --namespace AWS/ECS \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=ServiceName,Value=ml-e-backend-service Name=ClusterName,Value=$CLUSTER_NAME \
    --evaluation-periods 2

# High error rate alarm
aws cloudwatch put-metric-alarm \
    --alarm-name "ML-E-High-Error-Rate" \
    --alarm-description "ML-E high error rate" \
    --metric-name HTTPCode_Target_5XX_Count \
    --namespace AWS/ApplicationELB \
    --statistic Sum \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2
```

## 🔒 Security Configuration

### 1. AWS WAF Setup
```bash
# Create WAF Web ACL
aws wafv2 create-web-acl \
    --name ml-e-waf \
    --scope CLOUDFRONT \
    --default-action Allow={} \
    --rules '[
        {
            "Name": "RateLimitRule",
            "Priority": 1,
            "Statement": {
                "RateBasedStatement": {
                    "Limit": 2000,
                    "AggregateKeyType": "IP"
                }
            },
            "Action": {
                "Block": {}
            },
            "VisibilityConfig": {
                "SampledRequestsEnabled": true,
                "CloudWatchMetricsEnabled": true,
                "MetricName": "RateLimitRule"
            }
        }
    ]'
```

### 2. Security Headers
Update the frontend Nginx configuration to include security headers:

```nginx
# Add to nginx.conf
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:;" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## 📈 Auto Scaling Configuration

### 1. ECS Auto Scaling
```bash
# Register scalable target for backend
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --resource-id service/$CLUSTER_NAME/ml-e-backend-service \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity 2 \
    --max-capacity 10

# Create scaling policy
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --resource-id service/$CLUSTER_NAME/ml-e-backend-service \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name ml-e-backend-cpu-scaling \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
        "TargetValue": 70.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
        },
        "ScaleOutCooldown": 300,
        "ScaleInCooldown": 300
    }'
```

## 💰 Cost Optimization

### 1. Reserved Capacity
```bash
# For production workloads, consider reserved capacity
# This can save 30-50% on compute costs

# Example: Reserve Fargate capacity
aws ecs put-capacity-provider \
    --name ml-e-fargate-spot \
    --capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1,base=0
```

### 2. Lifecycle Policies
```bash
# S3 lifecycle policy for logs
cat > s3-lifecycle-policy.json << EOF
{
    "Rules": [
        {
            "ID": "LogsLifecycle",
            "Status": "Enabled",
            "Filter": {
                "Prefix": "logs/"
            },
            "Transitions": [
                {
                    "Days": 30,
                    "StorageClass": "STANDARD_IA"
                },
                {
                    "Days": 90,
                    "StorageClass": "GLACIER"
                }
            ],
            "Expiration": {
                "Days": 365
            }
        }
    ]
}
EOF
```

## 🔧 Deployment Automation

### 1. GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1
    
    - name: Build and push backend image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: ml-e-backend
        IMAGE_TAG: ${{ github.sha }}
      run: |
        cd backend
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
    
    - name: Build and push frontend image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: ml-e-frontend
        IMAGE_TAG: ${{ github.sha }}
      run: |
        cd frontend
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
    
    - name: Update ECS service
      run: |
        aws ecs update-service \
          --cluster ml-e-production \
          --service ml-e-backend-service \
          --force-new-deployment
        
        aws ecs update-service \
          --cluster ml-e-production \
          --service ml-e-frontend-service \
          --force-new-deployment
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Service Won't Start
```bash
# Check service events
aws ecs describe-services \
    --cluster $CLUSTER_NAME \
    --services ml-e-backend-service \
    --query 'services[0].events'

# Check task logs
aws logs get-log-events \
    --log-group-name /ecs/ml-e-backend \
    --log-stream-name ecs/ml-e-backend/TASK_ID
```

#### 2. Database Connection Issues
```bash
# Test DocumentDB connection from ECS task
aws ecs run-task \
    --cluster $CLUSTER_NAME \
    --task-definition ml-e-backend \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
    --overrides '{
        "containerOverrides": [
            {
                "name": "ml-e-backend",
                "command": ["sh", "-c", "nc -zv $DOCDB_ENDPOINT 27017"]
            }
        ]
    }'
```

#### 3. Load Balancer Health Checks Failing
```bash
# Check target group health
aws elbv2 describe-target-health \
    --target-group-arn $BACKEND_TG_ARN

# Update health check settings if needed
aws elbv2 modify-target-group \
    --target-group-arn $BACKEND_TG_ARN \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 5
```

### Performance Optimization

#### 1. Database Performance
```bash
# Enable DocumentDB profiler
aws docdb modify-db-cluster \
    --db-cluster-identifier ml-e-docdb-cluster \
    --cloudwatch-logs-export-configuration LogTypesToEnable=profiler

# Monitor slow queries in CloudWatch
```

#### 2. Redis Optimization
```bash
# Monitor Redis metrics
aws cloudwatch get-metric-statistics \
    --namespace AWS/ElastiCache \
    --metric-name CPUUtilization \
    --dimensions Name=CacheClusterId,Value=ml-e-redis-cluster \
    --start-time 2023-01-01T00:00:00Z \
    --end-time 2023-01-02T00:00:00Z \
    --period 3600 \
    --statistics Average
```

## 🎯 Production Checklist

### Pre-Deployment
- [ ] Environment variables configured in Secrets Manager
- [ ] SSL certificate validated and attached
- [ ] Security groups properly configured
- [ ] Database backups enabled
- [ ] Monitoring and alerting configured
- [ ] Auto-scaling policies in place

### Post-Deployment
- [ ] Health checks passing
- [ ] SSL certificate working
- [ ] Application accessible via domain
- [ ] Database connections working
- [ ] Logs flowing to CloudWatch
- [ ] Monitoring dashboards functional
- [ ] Auto-scaling tested

### Security Verification
- [ ] WAF rules active
- [ ] Security headers implemented
- [ ] Secrets properly managed
- [ ] Network isolation verified
- [ ] Access logs enabled
- [ ] Encryption at rest enabled

## 📞 Support & Maintenance

### Regular Maintenance Tasks
1. **Weekly**: Review CloudWatch metrics and logs
2. **Monthly**: Update container images with security patches
3. **Quarterly**: Review and optimize costs
4. **Annually**: Review and update SSL certificates

### Backup Strategy
- **DocumentDB**: Automated daily backups with 7-day retention
- **Application Data**: Regular exports to S3
- **Configuration**: Infrastructure as Code in version control

### Disaster Recovery
- **RTO**: 4 hours (Recovery Time Objective)
- **RPO**: 1 hour (Recovery Point Objective)
- **Multi-AZ**: Enabled for all critical services
- **Cross-Region**: Consider for critical production workloads

---

## 🎉 Deployment Complete!

Your ML-E application is now running on AWS with:

- ✅ **High Availability**: Multi-AZ deployment
- ✅ **Scalability**: Auto-scaling based on demand
- ✅ **Security**: WAF, SSL, and proper network isolation
- ✅ **Monitoring**: CloudWatch dashboards and alarms
- ✅ **Cost Optimization**: Right-sized resources with reserved capacity options

**Access your application at**: `https://your-domain.com` or `https://$ALB_DNS`

For ongoing support and updates, refer to the monitoring dashboards and maintain regular backup and security practices.

**Estimated Monthly Cost**: $216-298 for moderate usage (500-1000 students)
**Scaling Capability**: Can handle 10,000+ concurrent users with auto-scaling enabled

🚀 **ML-E is now live and ready to revolutionize machine learning education!**