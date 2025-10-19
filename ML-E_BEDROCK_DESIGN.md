# ML-E Design Document - AWS Bedrock Architecture

## Overview

ML-E is an intelligent AI tutoring system designed to teach Machine Learning concepts to high school students (grades 9-10) through an interactive web application. The system leverages AWS Bedrock for native cloud AI capabilities, featuring intelligent response caching, persistent conversation history, and adaptive model selection for optimal performance and cost efficiency.

The architecture follows a modern cloud-native pattern with AWS Bedrock integration, enabling scalable, maintainable, and cost-effective educational delivery. The system features advanced duplicate detection to optimize LLM usage, persistent MongoDB storage for conversation history, and seamless user experience across navigation.

**Key Features:**
- AWS Bedrock integration with Claude 3 models
- Intelligent model selection based on question complexity
- Persistent conversation history with dual storage strategy
- Advanced duplicate detection across sessions
- Real-time analytics and progress tracking
- Clean, responsive user interface optimized for students
- 37.5% cost reduction compared to OpenAI solutions

## Architecture

### High-Level System Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        React[React Web Application]
        Chat[Real-time Chat Interface]
        Dashboard[Analytics Dashboard]
        Profile[User Profile]
        Auth[Authentication Pages]
    end
    
    subgraph "API Gateway & Communication"
        Gateway[Express.js API Gateway]
        WS[WebSocket Server]
        Routes[REST API Routes]
    end
    
    subgraph "AWS Bedrock Integration"
        BedrockSvc[Bedrock Service]
        ModelSelector[Intelligent Model Selection]
        Claude3H[Claude 3 Haiku - Fast]
        Claude3S[Claude 3 Sonnet - Balanced]
    end
    
    subgraph "Core Services"
        AuthSvc[Authentication Service]
        ChatSvc[Chat Service with Duplicate Detection]
        SessionSvc[Session Management]
        AnalyticsSvc[Learning Analytics]
        CacheSvc[Intelligent Caching Engine]
    end
    
    subgraph "Storage & Caching"
        MongoDB[(MongoDB - DocumentDB)]
        Redis[(Redis - ElastiCache)]
        LocalStorage[Browser LocalStorage]
    end
    
    subgraph "AWS Infrastructure"
        ECS[ECS Fargate]
        ALB[Application Load Balancer]
        CloudWatch[CloudWatch Monitoring]
        IAM[IAM Roles & Policies]
    end
    
    React --> Gateway
    React --> WS
    Chat <--> WS
    WS --> ChatSvc
    ChatSvc --> CacheSvc
    CacheSvc --> BedrockSvc
    BedrockSvc --> ModelSelector
    ModelSelector --> Claude3H
    ModelSelector --> Claude3S
    
    ChatSvc --> MongoDB
    ChatSvc --> Redis
    
    Gateway --> AuthSvc
    Gateway --> SessionSvc
    Gateway --> AnalyticsSvc
    
    AuthSvc --> MongoDB
    SessionSvc --> MongoDB
    SessionSvc --> Redis
    AnalyticsSvc --> MongoDB
    
    React --> LocalStorage
    
    ECS --> Gateway
    ECS --> WS
    ALB --> ECS
    CloudWatch --> ECS
    IAM --> BedrockSvc
```