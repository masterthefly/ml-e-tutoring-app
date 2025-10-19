// Test dashboard API directly
// Run with: node test-dashboard.js

const axios = require('axios');

async function testDashboard() {
  console.log('📊 Testing Dashboard API\n');

  try {
    // Step 1: Login to get token
    console.log('1️⃣ Getting authentication token...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'student',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Token received');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Step 2: Test Dashboard Analytics API
    console.log('\n2️⃣ Testing Dashboard Analytics API...');
    
    const analyticsResponse = await axios.get('http://localhost:3001/api/analytics/dashboard?days=30', { headers });
    const analytics = analyticsResponse.data.data;
    
    console.log('✅ Dashboard analytics retrieved:');
    console.log('   Overall Progress:', analytics.overallProgress + '%');
    console.log('   Topics Completed:', analytics.topicsCompleted);
    console.log('   Total Time Spent:', analytics.totalTimeSpent + ' seconds');
    console.log('   Engagement Score:', analytics.engagementScore);
    console.log('   Learning Streak:', analytics.streakDays + ' days');
    console.log('   Learning Velocity:', analytics.learningVelocity);
    console.log('   Recent Topics:', analytics.recentTopics.length);
    console.log('   Mastered Concepts:', analytics.masteredConcepts.length);
    console.log('   Struggling Concepts:', analytics.strugglingConcepts.length);
    console.log('   Achievements:', analytics.achievements.length);
    console.log('   Weekly Progress Days:', analytics.weeklyProgress.length);

    if (analytics.recentTopics.length > 0) {
      console.log('\n📚 Recent Topics:');
      analytics.recentTopics.forEach((topic, index) => {
        console.log(`   ${index + 1}. ${topic}`);
      });
    }

    if (analytics.achievements.length > 0) {
      console.log('\n🏆 Recent Achievements:');
      analytics.achievements.forEach((achievement, index) => {
        console.log(`   ${index + 1}. ${achievement.name} - ${achievement.points} points`);
      });
    }

    console.log('\n🎉 Dashboard API test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Dashboard API working');
    console.log('✅ Analytics data available');
    console.log('✅ Progress tracking functional');

  } catch (error) {
    console.error('\n❌ Dashboard test failed:', error.message);
    
    if (error.response) {
      console.log('API Error:', error.response.status, error.response.data);
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure backend is running: npm run dev:backend');
    console.log('2. Check analytics API endpoints are registered');
    console.log('3. Verify MongoDB connection for analytics data');
  }
}

testDashboard();