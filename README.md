# ML-E Tutoring App

ML-E (pronounced "Melly") is a production-ready, multi-agentic AI web application designed to teach fundamental Machine Learning concepts to high school students (9th-10th grade) through an interactive, chat-based interface.

## Project Structure

```
ml-e-tutoring-app/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # Frontend services and API clients
│   │   └── main.tsx         # Application entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/                  # Node.js backend services
│   ├── src/
│   │   ├── agents/          # Multi-agent system implementation
│   │   ├── api/             # API Gateway and routes
│   │   ├── database/        # Database layer and models
│   │   ├── services/        # Core business services
│   │   └── index.ts         # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── shared/                   # Shared TypeScript types and interfaces
│   ├── src/
│   │   ├── types/           # Type definitions
│   │   └── index.ts         # Shared exports
│   ├── package.json
│   └── tsconfig.json
└── package.json             # Root workspace configuration
```

## Core Interfaces

The system is built around several key interfaces:

### Agent System
- **AgentState**: Manages individual agent state and capabilities
- **AgentMessage**: Handles communication between agents
- **CoordinationRequest**: Orchestrates multi-agent interactions

### User Management
- **User**: Student user profiles with preferences
- **LearningSession**: Conversation and learning state management
- **StudentProgress**: Learning progress tracking and analytics

### Content System
- **MLTopic**: Machine learning topics and curriculum structure
- **Exercise**: Interactive learning exercises and assessments
- **ConceptExample**: Real-world examples and explanations

## Technology Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Socket.io for real-time communication
- MathJax for mathematical notation
- D3.js for data visualization

### Backend
- Node.js with Express.js
- TypeScript for type safety
- Socket.io for WebSocket support
- MongoDB for data persistence
- Redis for session management
- JWT for authentication

### Multi-Agent System
- Coordinator Agent: Orchestrates agent interactions
- Tutor Agent: Provides educational content delivery
- Assessment Agent: Evaluates student understanding
- Content Agent: Generates adaptive learning materials

## Getting Started

1. Install dependencies for all packages:
   ```bash
   npm run install:all
   ```

2. Copy environment files and configure:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. Start development servers:
   ```bash
   npm run dev
   ```

This will start both the frontend (port 3000) and backend (port 3001) in development mode.

## Development Commands

- `npm run dev` - Start both frontend and backend in development mode
- `npm run build` - Build all packages for production
- `npm run lint` - Run linting across all packages
- `npm run type-check` - Run TypeScript type checking

## Requirements Addressed

This project structure addresses the following requirements:
- **1.1**: Chat interface foundation with real-time communication setup
- **5.1**: Multi-agent system architecture with proper interfaces
- **6.1**: Responsive web interface structure with accessibility considerations