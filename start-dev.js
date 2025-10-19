// Start both frontend and backend development servers
// Run with: node start-dev.js

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting ML-E Development Environment\n');

// Start backend
console.log('📡 Starting backend server...');
const backend = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'pipe',
  shell: true
});

backend.stdout.on('data', (data) => {
  console.log(`[BACKEND] ${data.toString().trim()}`);
});

backend.stderr.on('data', (data) => {
  console.error(`[BACKEND ERROR] ${data.toString().trim()}`);
});

// Start frontend after a delay
setTimeout(() => {
  console.log('\n🎨 Starting frontend server...');
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'frontend'),
    stdio: 'pipe',
    shell: true
  });

  frontend.stdout.on('data', (data) => {
    console.log(`[FRONTEND] ${data.toString().trim()}`);
  });

  frontend.stderr.on('data', (data) => {
    console.error(`[FRONTEND ERROR] ${data.toString().trim()}`);
  });

  frontend.on('close', (code) => {
    console.log(`\n[FRONTEND] Process exited with code ${code}`);
  });
}, 3000);

backend.on('close', (code) => {
  console.log(`\n[BACKEND] Process exited with code ${code}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down development servers...');
  backend.kill();
  frontend.kill();
  process.exit(0);
});

console.log('\n✅ Development environment started!');
console.log('📡 Backend: http://localhost:3001');
console.log('🎨 Frontend: http://localhost:3000');
console.log('\nPress Ctrl+C to stop all servers');