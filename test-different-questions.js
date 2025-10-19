// Test different ML questions to see OpenAI vs fallback responses
// Run with: node test-different-questions.js

const { io } = require('socket.io-client');
const axios = require('axios');

async function testDifferentQuestions() {
  console.log('🧠 Testing Different ML Questions\n');

  const questions = [
    'What is supervised learning?',
    'Explain decision trees',
    'How do neural networks work?',
    'What is the difference between classification and regression?',
    'What is overfitting in machine learning?'
  ];

  try {
    // Login
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'student',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Authenticated successfully\n');

    // Test each question
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`${i + 1}️⃣ Testing: "${question}"`);
      
      const socket = io('http://localhost:3001', {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);

        socket.on('connect', () => {
          socket.emit('chat:message', {
            message: question,
            sessionId: `test-${Date.now()}`,
            timestamp: new Date().toISOString()
          });
        });

        socket.on('chat:message', (data) => {
          if (data.agentResponse) {
            console.log(`📝 Response (${data.username}):`);
            console.log(`   ${data.message.substring(0, 150)}...`);
            console.log(`   Length: ${data.message.length} chars\n`);
            
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

      // Small delay between questions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('🎉 All questions tested successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDifferentQuestions();