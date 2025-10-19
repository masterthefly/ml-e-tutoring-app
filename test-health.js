// Health endpoint test script
// Run with: node test-health.js

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testHealthEndpoints() {
  console.log('🏥 Testing ML-E Health Endpoints\n');

  const endpoints = [
    { name: 'Main Health', url: `${BASE_URL}/health` },
    { name: 'API Health', url: `${BASE_URL}/api/health` },
    { name: 'Liveness Probe', url: `${BASE_URL}/api/health/liveness` },
    { name: 'Readiness Probe', url: `${BASE_URL}/api/health/readiness` }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`🔍 Testing ${endpoint.name}...`);
      const response = await axios.get(endpoint.url);
      console.log(`✅ ${endpoint.name}: ${response.status} - ${response.data.status || 'OK'}`);
      
      if (endpoint.name === 'API Health') {
        console.log(`   📊 Uptime: ${Math.round(response.data.uptime)}s`);
        console.log(`   💾 Memory: ${response.data.memory?.used}/${response.data.memory?.total} MB`);
        if (response.data.checks) {
          console.log(`   🔗 Database: ${response.data.checks.database || 'unknown'}`);
          console.log(`   🔗 Redis: ${response.data.checks.redis || 'unknown'}`);
        }
      }
      
    } catch (error) {
      console.log(`❌ ${endpoint.name}: Failed`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
      } else if (error.request) {
        console.log(`   No response - Is server running on port 3001?`);
      } else {
        console.log(`   Error: ${error.message}`);
      }
    }
    console.log('');
  }

  console.log('🎯 Health Check Summary:');
  console.log('✅ All endpoints should return 200 status');
  console.log('✅ Database should show "connected" when MongoDB is running');
  console.log('✅ Memory usage should be reasonable (< 100MB for basic setup)');
  console.log('✅ Uptime should increase each time you run this test');
}

testHealthEndpoints();