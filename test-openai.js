// Test OpenAI integration
// Run with: node test-openai.js

const axios = require('axios');

async function testOpenAI() {
  console.log('🤖 Testing OpenAI Integration\n');

  try {
    // Step 1: Login to get token
    console.log('1️⃣ Getting authentication token...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'student',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Token received:', token ? 'Yes' : 'No');

    // Step 2: Test agent status
    console.log('\n2️⃣ Checking agent status...');
    const statusResponse = await axios.get('http://localhost:3001/api/agents/status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Agent status:', statusResponse.data);

    // Step 3: Test chat endpoint
    console.log('\n3️⃣ Testing chat endpoint...');
    const sessionId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID format
    
    const chatResponse = await axios.post('http://localhost:3001/api/agents/chat', {
      message: 'What is supervised learning?',
      sessionId: sessionId
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Chat response received:');
    console.log('Message:', chatResponse.data.data.message.substring(0, 100) + '...');
    console.log('Agent:', chatResponse.data.data.agentName);

    console.log('\n🎉 OpenAI integration test completed!');

  } catch (error) {
    console.error('\n❌ OpenAI test failed:', error.message);
    
    if (error.response) {
      console.log('API Error:', error.response.status, error.response.data);
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if OPENAI_API_KEY is set in backend/.env');
    console.log('2. Verify the API key is valid');
    console.log('3. Check backend logs for OpenAI initialization messages');
  }
}

testOpenAI();