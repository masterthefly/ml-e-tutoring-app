# ML-E Tutoring App - Local Development Setup

## Prerequisites

Before running the app locally, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher)
- **npm** (v9.0.0 or higher)
- **MongoDB** (v6.0 or higher)
- **Redis** (v7.0 or higher)
- **Git**

## Quick Start

### 1. Clone and Install Dependencies

```bash
# Install all dependencies for all workspaces
npm run install:all
```

### 2. Environment Configuration

#### Backend Environment Setup
```bash
# Copy the example environment file
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your configuration:

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/ml-e-tutoring
REDIS_URL=redis://localhost:6379

# Authentication (CHANGE THESE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-make-it-long-and-random
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production-also-long-and-random

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# AI/LLM Configuration (REQUIRED)
OPENAI_API_KEY=sk-your-openai-api-key-here
# ANTHROPIC_API_KEY=your-anthropic-api-key-here  # Optional

# Security
BCRYPT_SALT_ROUNDS=12
```

#### Frontend Environment Setup
```bash
# Copy the example environment file
cp frontend/.env.example frontend/.env
```

The default frontend `.env` should work for local development:

```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
VITE_NODE_ENV=development
```

### 3. Start Required Services

#### Start MongoDB
```bash
# On macOS with Homebrew
brew services start mongodb-community

# On Ubuntu/Debian
sudo systemctl start mongod

# On Windows (if installed as service)
net start MongoDB

# Or run directly
mongod --dbpath /path/to/your/db/directory
```

#### Start Redis
```bash
# On macOS with Homebrew
brew services start redis

# On Ubuntu/Debian
sudo systemctl start redis-server

# On Windows (if installed)
redis-server

# Or run directly
redis-server
```

### 4. Run the Application

```bash
# Start both frontend and backend concurrently
npm run dev

# Or start them separately:
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend  
npm run dev:frontend
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api
- **WebSocket**: http://localhost:3001

## Required Credentials

### Essential (Required to run)
1. **OpenAI API Key**: Get from https://platform.openai.com/api-keys
   - Add to `backend/.env` as `OPENAI_API_KEY=sk-...`
   - This is required for the AI tutoring functionality

### Optional (for enhanced features)
1. **Anthropic API Key**: Get from https://console.anthropic.com/
   - Add to `backend/.env` as `ANTHROPIC_API_KEY=...`
   - Provides additional AI model options

2. **InfluxDB** (for analytics):
   - Install locally or use InfluxDB Cloud
   - Add credentials to `backend/.env`

## Development Commands

```bash
# Install dependencies for all workspaces
npm run install:all

# Run development servers
npm run dev

# Build all packages
npm run build

# Run linting
npm run lint

# Run type checking
npm run type-check

# Run tests (backend)
cd backend && npm test
```

## Database Setup

The application will automatically create the necessary database and collections when you first run it. No manual database setup is required.

### Default Test User
On first run, the system will create a default test user:
- **Username**: `student`
- **Password**: `password123`
- **Email**: `student@example.com`
- **Grade**: 10

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   # Kill processes on ports 3000 and 3001
   npx kill-port 3000 3001
   ```

2. **MongoDB connection failed**:
   - Ensure MongoDB is running: `brew services list | grep mongodb`
   - Check the connection string in `backend/.env`

3. **Redis connection failed**:
   - Ensure Redis is running: `brew services list | grep redis`
   - Check the Redis URL in `backend/.env`

4. **OpenAI API errors**:
   - Verify your API key is correct
   - Check your OpenAI account has credits
   - Ensure the key has the necessary permissions

5. **TypeScript errors**:
   ```bash
   # Run type checking
   npm run type-check
   
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm run install:all
   ```

### Development Tips

1. **Hot Reload**: Both frontend and backend support hot reload during development
2. **API Testing**: Use the built-in health endpoints:
   - `GET http://localhost:3001/api/health` - Basic health check
   - `GET http://localhost:3001/api/health/detailed` - Detailed system status
3. **WebSocket Testing**: Check connection status in the browser console
4. **Database Inspection**: Use MongoDB Compass or the mongo shell to inspect data

## Production Deployment

This setup is for **local development only**. For production deployment:

1. **Environment Variables**: Use secure, production-grade secrets
2. **Database**: Use MongoDB Atlas or a managed MongoDB instance
3. **Redis**: Use Redis Cloud or a managed Redis instance
4. **SSL/TLS**: Enable HTTPS for all communications
5. **Process Management**: Use PM2 or similar for process management
6. **Monitoring**: Set up proper logging and monitoring
7. **Security**: Enable all security middleware and rate limiting

## AWS Deployment (Optional)

You do **NOT** need to deploy to AWS for local development. However, if you want to deploy to AWS later:

1. **Database**: Use Amazon DocumentDB (MongoDB-compatible)
2. **Cache**: Use Amazon ElastiCache (Redis)
3. **Compute**: Use Amazon ECS, EKS, or EC2
4. **Load Balancer**: Use Application Load Balancer
5. **Storage**: Use Amazon S3 for static assets
6. **Monitoring**: Use CloudWatch for logging and monitoring

The application is designed to work locally first, then can be containerized and deployed to any cloud provider.