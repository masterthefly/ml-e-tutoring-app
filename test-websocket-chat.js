// WebSocket chat test - simulates user sending a message and waiting for response
// Run with: node test-websocket-chat.js

const { io } = require('socket.io-client');
const axios = require('axios');

async function testWebSocketChat() {
  console.log('💬 Testing WebSocket Chat Functionality\n');

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

    // Step 2: Connect to WebSocket
    console.log('\n2️⃣ Connecting to WebSocket...');
    
    const socket = io('http://localhost:3001', {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      timeout: 20000
    });

    let connected = false;
    let messageReceived = false;
    let agentResponseReceived = false;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ WebSocket connected successfully!');
      console.log('   Socket ID:', socket.id);
      connected = true;
    });

    socket.on('connected', (data) => {
      console.log('✅ Connection confirmation received:', data);
    });

    socket.on('heartbeat', (data) => {
      console.log('💓 Heartbeat received:', data);
      socket.emit('heartbeat-response', { timestamp: new Date().toISOString() });
    });

    socket.on('connect_error', (error) => {
      console.log('❌ WebSocket connection failed:', error.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      connected = false;
    });

    socket.on('chat:message', (data) => {
      console.log('📨 Received message:', {
        id: data.id,
        username: data.username,
        message: data.message.substring(0, 100) + (data.message.length > 100 ? '...' : ''),
        agentResponse: data.agentResponse,
        timestamp: data.timestamp
      });
      
      if (data.agentResponse) {
        agentResponseReceived = true;
      } else {
        messageReceived = true;
      }
    });

    socket.on('error', (error) => {
      console.log('❌ WebSocket error:', error);
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 15000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Step 3: Send a message and wait for response
    console.log('\n3️⃣ Sending test message...');
    const testMessage = 'What is supervised learning?';
    
    socket.emit('chat:message', {
      message: testMessage,
      sessionId: 'test-session-' + Date.now(),
      timestamp: new Date().toISOString()
    });

    console.log('📤 Sent message:', testMessage);

    // Wait for message echo and agent response
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Message response timeout'));
      }, 10000);

      const checkResponses = () => {
        if (messageReceived && agentResponseReceived) {
          clearTimeout(timeout);
          resolve();
        }
      };

      socket.on('chat:message', checkResponses);
    });

    console.log('✅ Message echo received');
    console.log('✅ Agent response received');

    // Step 4: Test connection stability
    console.log('\n4️⃣ Testing connection stability...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (connected) {
      console.log('✅ Connection remained stable for 5 seconds');
    } else {
      console.log('❌ Connection was lost during stability test');
    }

    console.log('\n🎉 WebSocket chat test completed successfully!');
    
    // Cleanup
    socket.disconnect();

  } catch (error) {
    console.error('\n❌ WebSocket chat test failed:', error.message);
    
    if (error.response) {
      console.log('API Error:', error.response.status, error.response.data);
    }
    
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Make sure backend is running: npm run dev:backend');
    console.log('2. Check backend logs for errors');
    console.log('3. Verify Redis is running (optional for message persistence)');
    console.log('4. Check WebSocket server initialization');
  }
}

testWebSocketChat();