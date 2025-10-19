// Direct test of OpenAI service
// Run with: node test-openai-direct.js

const axios = require('axios');

async function testOpenAIDirect() {
  console.log('🔍 Testing OpenAI Service Directly\n');

  try {
    // Test with a simple question
    console.log('1️⃣ Testing WebSocket with supervised learning question...');
    
    // Login first
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'student',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    
    // Connect to WebSocket and send message
    const { io } = require('socket.io-client');
    
    const socket = io('http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 10000
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 20000);

      socket.on('connect', () => {
        console.log('✅ Connected to WebSocket');
        
        // Send a question that should trigger specific response
        socket.emit('chat:message', {
          message: 'What is supervised learning?',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date().toISOString()
        });
      });

      socket.on('chat:message', (data) => {
        if (data.agentResponse) {
          console.log('\n📝 Agent Response Details:');
          console.log('Agent Name:', data.username);
          console.log('Message Length:', data.message.length);
          console.log('Full Message:', data.message);
          console.log('Timestamp:', data.timestamp);
          
          clearTimeout(timeout);
          socket.disconnect();
          resolve();
        }
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('\n2️⃣ Testing with different question...');
    
    // Test with another question
    const socket2 = io('http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 10000
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 20000);

      socket2.on('connect', () => {
        console.log('✅ Connected to WebSocket (second test)');
        
        // Send a different question
        socket2.emit('chat:message', {
          message: 'How do neural networks work?',
          sessionId: '550e8400-e29b-41d4-a716-446655440001',
          timestamp: new Date().toISOString()
        });
      });

      socket2.on('chat:message', (data) => {
        if (data.agentResponse) {
          console.log('\n📝 Second Agent Response Details:');
          console.log('Agent Name:', data.username);
          console.log('Message Length:', data.message.length);
          console.log('Full Message:', data.message);
          
          clearTimeout(timeout);
          socket2.disconnect();
          resolve();
        }
      });

      socket2.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('\n🎉 OpenAI direct test completed!');

  } catch (error) {
    console.error('\n❌ OpenAI direct test failed:', error.message);
  }
}

testOpenAIDirect();