#!/usr/bin/env node

// Complete ML-E System Startup and Health Check Script
// Run with: node start-system.js

const { spawn, exec } = require('child_process');
const axios = require('axios');
const path = require('path');

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkService(name, url, timeout = 5000) {
  try {
    const response = await axios.get(url, { timeout });
    log('green', `✅ ${name}: ${response.status} - ${response.data.status || 'OK'}`);
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log('red', `❌ ${name}: Connection refused - Service not running`);
    } else if (error.code === 'ETIMEDOUT') {
      log('red', `❌ ${name}: Timeout - Service not responding`);
    } else {
      log('red', `❌ ${name}: ${error.message}`);
    }
    return false;
  }
}

async function checkDependencies() {
  log('cyan', '\n🔍 Checking System Dependencies...\n');
  
  const checks = [
    { name: 'Node.js', cmd: 'node --version' },
    { name: 'npm', cmd: 'npm --version' },
    { name: 'MongoDB', cmd: 'mongod --version' },
    { name: 'Redis', cmd: 'redis-server --version' }
  ];

  for (const check of checks) {
    try {
      await new Promise((resolve, reject) => {
        exec(check.cmd, (error, stdout) => {
          if (error) reject(error);
          else {
            log('green', `✅ ${check.name}: ${stdout.trim().split('\n')[0]}`);
            resolve();
          }
        });
      });
    } catch (error) {
      log('red', `❌ ${check.name}: Not found or not working`);
      log('yellow', `   Install ${check.name} to continue`);
    }
  }
}

async function startServices() {
  log('cyan', '\n🚀 Starting System Services...\n');
  
  // Check if services are already running
  log('blue', '📡 Checking if services are already running...');
  
  const mongoRunning = await checkService('MongoDB', 'http://localhost:27017', 2000).catch(() => false);
  const redisRunning = await checkService('Redis', 'http://localhost:6379', 2000).catch(() => false);
  
  if (!mongoRunning) {
    log('yellow', '🔄 Starting MongoDB...');
    // Instructions for different platforms
    log('white', '   macOS: brew services start mongodb-community');
    log('white', '   Linux: sudo systemctl start mongod');
    log('white', '   Windows: net start MongoDB');
    log('white', '   Manual: mongod --dbpath /path/to/db');
  }
  
  if (!redisRunning) {
    log('yellow', '🔄 Starting Redis...');
    log('white', '   macOS: brew services start redis');
    log('white', '   Linux: sudo systemctl start redis-server');
    log('white', '   Windows: redis-server');
    log('white', '   Manual: redis-server');
  }
  
  log('blue', '\n⏳ Waiting for services to start...');
  await sleep(3000);
}

async function checkEnvironment() {
  log('cyan', '\n🔧 Checking Environment Configuration...\n');
  
  const fs = require('fs');
  
  // Check backend .env
  if (fs.existsSync('backend/.env')) {
    log('green', '✅ Backend .env file exists');
    
    const envContent = fs.readFileSync('backend/.env', 'utf8');
    const hasOpenAI = envContent.includes('OPENAI_API_KEY=sk-');
    const hasJWT = envContent.includes('JWT_SECRET=');
    
    if (hasJWT) {
      log('green', '✅ JWT secrets configured');
    } else {
      log('yellow', '⚠️  JWT secrets using defaults (OK for development)');
    }
    
    if (hasOpenAI) {
      log('green', '✅ OpenAI API key configured');
    } else {
      log('yellow', '⚠️  OpenAI API key not set (AI features disabled)');
      log('white', '   Add OPENAI_API_KEY=sk-your-key to backend/.env for AI features');
    }
  } else {
    log('red', '❌ Backend .env file missing');
    log('white', '   Copy backend/.env.example to backend/.env');
  }
  
  // Check frontend .env
  if (fs.existsSync('frontend/.env')) {
    log('green', '✅ Frontend .env file exists');
  } else {
    log('yellow', '⚠️  Frontend .env file missing (using defaults)');
  }
}

async function startApplication() {
  log('cyan', '\n🎯 Starting ML-E Application...\n');
  
  log('blue', '📦 Installing dependencies...');
  
  try {
    await new Promise((resolve, reject) => {
      const install = spawn('npm', ['run', 'install:all'], { 
        stdio: 'pipe',
        shell: true 
      });
      
      install.on('close', (code) => {
        if (code === 0) {
          log('green', '✅ Dependencies installed');
          resolve();
        } else {
          reject(new Error(`Installation failed with code ${code}`));
        }
      });
    });
  } catch (error) {
    log('red', '❌ Failed to install dependencies');
    log('white', '   Try running: npm run install:all');
    return false;
  }
  
  log('blue', '🚀 Starting backend server...');
  
  const backend = spawn('npm', ['run', 'dev:backend'], { 
    stdio: 'pipe',
    shell: true,
    cwd: process.cwd()
  });
  
  // Wait for backend to start
  await sleep(5000);
  
  log('blue', '🌐 Starting frontend server...');
  
  const frontend = spawn('npm', ['run', 'dev:frontend'], { 
    stdio: 'pipe',
    shell: true,
    cwd: process.cwd()
  });
  
  // Wait for frontend to start
  await sleep(3000);
  
  return { backend, frontend };
}

async function healthCheck() {
  log('cyan', '\n🏥 System Health Check...\n');
  
  const endpoints = [
    { name: 'Backend Health', url: 'http://localhost:3001/health' },
    { name: 'API Health', url: 'http://localhost:3001/api/health' },
    { name: 'Frontend', url: 'http://localhost:3000' }
  ];
  
  let allHealthy = true;
  
  for (const endpoint of endpoints) {
    const healthy = await checkService(endpoint.name, endpoint.url);
    if (!healthy) allHealthy = false;
  }
  
  return allHealthy;
}

async function testLogin() {
  log('cyan', '\n🔐 Testing Authentication...\n');
  
  try {
    const response = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'student',
      password: 'password123'
    });
    
    log('green', '✅ Login test successful');
    log('white', `   User: ${response.data.user.username}`);
    log('white', `   Token: ${response.data.token ? 'Received' : 'Missing'}`);
    return true;
  } catch (error) {
    log('red', '❌ Login test failed');
    if (error.response) {
      log('white', `   Status: ${error.response.status}`);
      log('white', `   Error: ${error.response.data.error || error.response.data.message}`);
    } else {
      log('white', `   Error: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  log('magenta', '🤖 ML-E System Startup & Health Check\n');
  log('white', '=====================================\n');
  
  // Step 1: Check dependencies
  await checkDependencies();
  
  // Step 2: Check environment
  await checkEnvironment();
  
  // Step 3: Start services
  await startServices();
  
  // Step 4: Start application
  const processes = await startApplication();
  
  if (!processes) {
    log('red', '\n❌ Failed to start application');
    process.exit(1);
  }
  
  // Step 5: Health check
  log('blue', '\n⏳ Waiting for services to be ready...');
  await sleep(5000);
  
  const healthy = await healthCheck();
  
  // Step 6: Test login
  if (healthy) {
    await testLogin();
  }
  
  // Final status
  log('cyan', '\n📊 System Status Summary:\n');
  
  if (healthy) {
    log('green', '🎉 ML-E System is running successfully!');
    log('white', '\n🌐 Access Points:');
    log('white', '   Frontend: http://localhost:3000');
    log('white', '   Backend:  http://localhost:3001');
    log('white', '   API:      http://localhost:3001/api');
    log('white', '\n🔐 Default Login:');
    log('white', '   Username: student');
    log('white', '   Password: password123');
    log('white', '\n📝 Logs:');
    log('white', '   Backend logs will appear above');
    log('white', '   Frontend: Check browser console');
    log('white', '\n🛑 To stop: Ctrl+C');
  } else {
    log('red', '❌ System startup incomplete');
    log('white', '\n🔧 Troubleshooting:');
    log('white', '   1. Check that MongoDB and Redis are running');
    log('white', '   2. Verify .env files are configured');
    log('white', '   3. Run: node test-health.js');
    log('white', '   4. Check logs above for specific errors');
  }
  
  // Keep processes running
  if (processes) {
    process.on('SIGINT', () => {
      log('yellow', '\n🛑 Shutting down ML-E system...');
      processes.backend.kill();
      processes.frontend.kill();
      process.exit(0);
    });
    
    // Keep the script running
    await new Promise(() => {});
  }
}

main().catch(error => {
  log('red', `\n💥 System startup failed: ${error.message}`);
  process.exit(1);
});