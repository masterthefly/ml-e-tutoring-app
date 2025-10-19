# 🚨 URGENT: 2-Hour AWS Bedrock Migration Guide

## ⏰ Timeline: Complete Migration in 2 Hours

### **Hour 1: Code Updates & AWS Setup (60 minutes)**
### **Hour 2: Deployment & Testing (60 minutes)**

---

## 🚀 HOUR 1: CODE UPDATES & AWS SETUP

### Step 1: AWS Bedrock Setup (15 minutes)

#### 1.1 Enable Bedrock Models
```bash
# Set your AWS region
export AWS_REGION=us-east-1

# Enable Claude 3 models (run these commands)
aws bedrock put-foundation-model-availability \
    --model-id anthropic.claude-3-haiku-20240307-v1:0 \
    --model-availability AVAILABLE

aws bedrock put-foundation-model-availability \
    --model-id anthropic.claude-3-sonnet-20240229-v1:0 \
    --model-availability AVAILABLE
```

#### 1.2 Create IAM Role for Bedrock
```bash
# Create Bedrock IAM policy
cat > bedrock-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream"
            ],
            "Resource": [
                "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
                "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
            ]
        }
    ]
}
EOF

# Create the policy
aws iam create-policy \
    --policy-name ML-E-Bedrock-Policy \
    --policy-document file://bedrock-policy.json

# Attach to existing ECS task role
aws iam attach-role-policy \
    --role-name ml-e-ecs-execution-role \
    --policy-arn arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/ML-E-Bedrock-Policy
```

### Step 2: Update Backend Code (30 minutes)

#### 2.1 Install Dependencies
```bash
cd backend
npm install @aws-sdk/client-bedrock-runtime@^3.450.0
```

#### 2.2 Create Bedrock Service
```bash
# Create the new service file
touch src/services/bedrock.service.ts
```

#### 2.3 Update Environment Variables
```bash
# Update backend/.env
cat >> .env << EOF

# AWS Bedrock Configuration
AWS_REGION=us-east-1
BEDROCK_FAST_MODEL=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_BALANCED_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
EOF
```

### Step 3: Code Implementation (15 minutes)

#### 3.1 Replace OpenAI Service with Bedrock Service
**File: `backend/src/services/bedrock.service.ts`**

#### 3.2 Update WebSocket Service
**File: `backend/src/services/websocket.service.ts`**

#### 3.3 Update Package.json
**File: `backend/package.json`**

---

## 🚀 HOUR 2: DEPLOYMENT & TESTING

### Step 4: Build and Deploy (30 minutes)

#### 4.1 Build Updated Backend
```bash
cd backend
npm run build

# Build Docker image
docker build -t ml-e-backend:bedrock .

# Tag for ECR
docker tag ml-e-backend:bedrock $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ml-e-backend:bedrock

# Push to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ml-e-backend:bedrock
```

#### 4.2 Update ECS Service
```bash
# Update task definition with new image
aws ecs register-task-definition \
    --family ml-e-backend \
    --task-role-arn arn:aws:iam::$AWS_ACCOUNT_ID:role/ml-e-ecs-execution-role \
    --execution-role-arn arn:aws:iam::$AWS_ACCOUNT_ID:role/ml-e-ecs-execution-role \
    --network-mode awsvpc \
    --requires-compatibilities FARGATE \
    --cpu 1024 \
    --memory 2048 \
    --container-definitions '[
        {
            "name": "ml-e-backend",
            "image": "'$AWS_ACCOUNT_ID'.dkr.ecr.'$AWS_REGION'.amazonaws.com/ml-e-backend:bedrock",
            "portMappings": [{"containerPort": 3001, "protocol": "tcp"}],
            "essential": true,
            "environment": [
                {"name": "NODE_ENV", "value": "production"},
                {"name": "AWS_REGION", "value": "'$AWS_REGION'"},
                {"name": "BEDROCK_FAST_MODEL", "value": "anthropic.claude-3-haiku-20240307-v1:0"},
                {"name": "BEDROCK_BALANCED_MODEL", "value": "anthropic.claude-3-sonnet-20240229-v1:0"}
            ],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/ml-e-backend",
                    "awslogs-region": "'$AWS_REGION'",
                    "awslogs-stream-prefix": "ecs"
                }
            }
        }
    ]'

# Update ECS service
aws ecs update-service \
    --cluster ml-e-production \
    --service ml-e-backend-service \
    --task-definition ml-e-backend \
    --force-new-deployment
```

### Step 5: Testing & Validation (30 minutes)

#### 5.1 Health Check
```bash
# Check service status
aws ecs describe-services \
    --cluster ml-e-production \
    --services ml-e-backend-service

# Check logs
aws logs tail /ecs/ml-e-backend --follow
```

#### 5.2 Quick Test
```bash
# Test Bedrock integration
curl -X POST http://your-alb-dns/api/test-bedrock \
    -H "Content-Type: application/json" \
    -d '{"message": "What is machine learning?"}'
```

---

## 📝 CRITICAL FILES TO UPDATE

### File 1: `backend/src/services/bedrock.service.ts`