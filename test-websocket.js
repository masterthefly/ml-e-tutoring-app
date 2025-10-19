// WebSocket connection test
// Run with: node test-websocket.js

const { io } = require('socket.io-client');
const axios = require('axios');

async function testWebSocketConnection() {
  console.log('🔌 Testing WebSocket Connection\n');

  try {
    // Step 1: Login to get token
    console.log('1️⃣ Getting authentication token...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'student',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Token received:', token ? 'Yes' : 'No');
    
    if (!token) {
      throw new Error('No token received from login');
    }

    // Step 2: Test WebSocket connection
    console.log('\n2️⃣ Testing WebSocket connection...');
    
    const socket = io('http://localhost:3001', {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      timeout: 5000
    });

    // Connection events
    socket.on('connect', () => {
      console.log('✅ WebSocket connected successfully!');
      console.log('   Socket ID:', socket.id);
      
      // Test sending a message
      console.log('\n3️⃣ Testing message sending...');
      socket.emit('chat:message', {
        message: 'Hello from test script!',
        sessionId: 'test-session',
        timestamp: new Date().toISOString()
      });
    });

    socket.on('connect_error', (error) => {
      console.log('❌ WebSocket connection failed:', error.message);
      console.log('   This usually means:');
      console.log('   - Backend server is not running');
      console.log('   - Authentication token is invalid');
      console.log('   - WebSocket server is not properly initialized');
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
    });

    socket.on('chat:message', (data) => {
      console.log('✅ Received message:', data);
    });

    socket.on('connected', (data) => {
      console.log('✅ Connection confirmation received:', data);
    });

    socket.on('error', (error) => {
      console.log('❌ WebSocket error:', error);
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('\n🎉 WebSocket test completed successfully!');
    
    // Cleanup
    socket.disconnect();

  } catch (error) {
    console.error('\n❌ WebSocket test failed:', error.message);
    
    if (error.response) {
      console.log('API Error:', error.response.status, error.response.data);
    }
    
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Make sure backend is running: npm run dev:backend');
    console.log('2. Check backend logs for WebSocket initialization');
    console.log('3. Verify authentication is working: node test-login.js');
    console.log('4. Check that JWT_SECRET matches between frontend and backend');
  }
}

testWebSocketConnection();