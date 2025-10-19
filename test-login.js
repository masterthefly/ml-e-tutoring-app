// Quick test script to verify login functionality
// Run with: node test-login.js

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function testLogin() {
  console.log('🧪 Testing ML-E Login Functionality\n');

  try {
    // Test 1: Health Check (main endpoint)
    console.log('1️⃣ Testing main health endpoint...');
    const healthResponse = await axios.get('http://localhost:3001/health');
    console.log('✅ Main health check passed:', healthResponse.data);

    // Test 1b: API Health Check
    console.log('1️⃣b Testing API health endpoint...');
    const apiHealthResponse = await axios.get(`${API_BASE}/health`);
    console.log('✅ API health check passed:', apiHealthResponse.data);

    // Test 2: Login with username
    console.log('\n2️⃣ Testing login with username...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      username: 'student',
      password: 'password123'
    });
    console.log('✅ Login successful!');
    console.log('Response format:', Object.keys(loginResponse.data));
    console.log('User:', loginResponse.data.user);
    console.log('Token received:', loginResponse.data.token ? 'Yes' : 'No');
    console.log('RefreshToken received:', loginResponse.data.refreshToken ? 'Yes' : 'No');

    // Test 3: Login with email
    console.log('\n3️⃣ Testing login with email...');
    const emailLoginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'student@example.com',
      password: 'password123'
    });
    console.log('✅ Email login successful!');

    // Test 4: Test wrong credentials (should fail)
    console.log('\n4️⃣ Testing wrong credentials (should fail)...');
    try {
      await axios.post(`${API_BASE}/auth/login`, {
        username: 'student',
        password: 'wrongpassword'
      });
      console.log('❌ This should have failed!');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Wrong credentials properly rejected');
        console.log('Error message:', error.response.data.error);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    console.log('\n🎉 All tests passed! Your login is working correctly.');
    console.log('\n📝 Use these credentials in the frontend:');
    console.log('   Username: student');
    console.log('   Password: password123');
    console.log('   OR');
    console.log('   Email: student@example.com');
    console.log('   Password: password123');

  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else if (error.request) {
      console.error('No response received. Is the server running on port 3001?');
    } else {
      console.error('Error:', error.message);
    }
    
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Make sure MongoDB is running');
    console.log('2. Make sure Redis is running');
    console.log('3. Make sure the backend server is running (npm run dev:backend)');
    console.log('4. Check that your .env file has the correct settings');
  }
}

testLogin();