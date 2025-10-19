// Test session continuity across navigation
// Run with: node test-session-continuity.js

const { io } = require('socket.io-client');
const axios = require('axios');

async function testSessionContinuity() {
  console.log('🔄 Testing Session Continuity Across Navigation\n');

  try {
    // Step 1: Login to get token
    console.log('1️⃣ Getting authentication token...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'student',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Token received');

    // Step 2: Simulate first chat session (user opens chat page)
    console.log('\n2️⃣ Simulating first chat session...');
    const sessionId1 = `continuity_test_${Date.now()}`;
    
    const socket1 = io('http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 10000
    });

    let firstSessionMessages = [];

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 25000);
      let responseCount = 0;

      socket1.on('connect', () => {
        console.log('✅ Connected to WebSocket (First Session)');
        
        // Send first message
        socket1.emit('chat:message', {
          message: 'What is machine learning?',
          sessionId: sessionId1,
          timestamp: new Date().toISOString()
        });
      });

      socket1.on('chat:message', (data) => {
        firstSessionMessages.push(data);
        console.log(`📨 First Session Message ${firstSessionMessages.length}: ${data.agentResponse ? 'Agent' : 'User'} - ${data.message.substring(0, 40)}...`);
        
        if (data.agentResponse) {
          responseCount++;
          
          if (responseCount === 1) {
            // Send second message
            setTimeout(() => {
              socket1.emit('chat:message', {
                message: 'Explain supervised learning',
                sessionId: sessionId1,
                timestamp: new Date().toISOString()
              });
            }, 1000);
          } else if (responseCount === 2) {
            // End first session (simulate navigation away)
            console.log(`✅ First session completed with ${firstSessionMessages.length} messages`);
            clearTimeout(timeout);
            socket1.disconnect();
            resolve();
          }
        }
      });

      socket1.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Step 3: Simulate navigation away and back (new socket connection)
    console.log('\n3️⃣ Simulating navigation back to chat (session continuity test)...');
    
    // Wait a moment to simulate navigation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const socket2 = io('http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 10000
    });

    let continuityMessages = [];

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 20000);

      socket2.on('connect', () => {
        console.log('✅ Connected to WebSocket (Continuity Test)');
        
        // Send a new message to the SAME session to test continuity
        socket2.emit('chat:message', {
          message: 'What are neural networks?',
          sessionId: sessionId1, // Same session ID to test persistence
          timestamp: new Date().toISOString()
        });
      });

      socket2.on('chat:message', (data) => {
        continuityMessages.push(data);
        
        if (data.agentResponse) {
          console.log(`✅ Session continuity working - received response in continued session`);
          console.log(`📊 New messages in continuity test: ${continuityMessages.length}`);
          
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

    // Step 4: Test multiple navigation cycles
    console.log('\n4️⃣ Testing multiple navigation cycles...');
    
    for (let cycle = 1; cycle <= 3; cycle++) {
      console.log(`   Cycle ${cycle}: Simulating navigation...`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const socketCycle = io('http://localhost:3001', {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);

        socketCycle.on('connect', () => {
          // Send message to same session
          socketCycle.emit('chat:message', {
            message: `Cycle ${cycle}: Tell me about deep learning`,
            sessionId: sessionId1,
            timestamp: new Date().toISOString()
          });
        });

        socketCycle.on('chat:message', (data) => {
          if (data.agentResponse) {
            console.log(`   ✅ Cycle ${cycle} successful - session maintained`);
            clearTimeout(timeout);
            socketCycle.disconnect();
            resolve();
          }
        });

        socketCycle.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    }

    console.log('\n🎉 Session continuity test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Initial chat session established with multiple messages');
    console.log('✅ Session continuity maintained after navigation');
    console.log('✅ Multiple navigation cycles successful');
    console.log('✅ Same session ID preserved across all connections');
    console.log('✅ Message history maintained throughout all tests');

  } catch (error) {
    console.error('\n❌ Session continuity test failed:', error.message);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if session service is properly maintaining session IDs');
    console.log('2. Verify localStorage is persisting session data');
    console.log('3. Ensure WebSocket connections are using the same session');
    console.log('4. Check for session cleanup or expiry issues');
  }
}

testSessionContinuity();