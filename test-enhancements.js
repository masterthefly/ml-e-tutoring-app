// Test the new enhancements: Profile and Analytics
// Run with: node test-enhancements.js

const axios = require('axios');

async function testEnhancements() {
  console.log('🚀 Testing New Enhancements\n');

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

    // Step 2: Test Profile API
    console.log('\n2️⃣ Testing Profile API...');
    
    // Get current profile
    const profileResponse = await axios.get('http://localhost:3001/api/profile', { headers });
    console.log('✅ Profile retrieved:', {
      username: profileResponse.data.data.username,
      profileCompleted: profileResponse.data.data.profileCompleted,
      interestsCount: profileResponse.data.data.learningInterests?.length || 0
    });

    // Update profile
    const updateData = {
      firstName: 'John',
      lastName: 'Student',
      learningInterests: ['Neural Networks', 'Deep Learning', 'Computer Vision'],
      preferences: {
        learningPace: 'medium',
        difficultyLevel: 7
      }
    };

    const updateResponse = await axios.put('http://localhost:3001/api/profile', updateData, { headers });
    console.log('✅ Profile updated:', {
      profileCompleted: updateResponse.data.data.profileCompleted,
      firstName: updateResponse.data.data.firstName,
      interestsCount: updateResponse.data.data.learningInterests.length
    });

    // Get interest suggestions
    const suggestionsResponse = await axios.get('http://localhost:3001/api/profile/interests/suggestions', { headers });
    console.log('✅ Interest suggestions received:', suggestionsResponse.data.data.length, 'suggestions');

    // Step 3: Test Analytics API
    console.log('\n3️⃣ Testing Analytics API...');

    // Start a session
    const sessionId = `test_session_${Date.now()}`;
    await axios.post('http://localhost:3001/api/analytics/session/start', {
      sessionId,
      difficultyLevel: 6
    }, { headers });
    console.log('✅ Analytics session started:', sessionId);

    // Track some progress
    await axios.post('http://localhost:3001/api/analytics/progress', {
      sessionId,
      topicId: 'neural_networks',
      topicName: 'Neural Networks',
      action: 'started',
      progressPercentage: 25,
      timeSpent: 300,
      difficultyLevel: 6,
      masteryLevel: 'beginner',
      metadata: {
        conceptsUnderstood: ['neurons', 'layers'],
        questionsAnswered: 2
      }
    }, { headers });
    console.log('✅ Progress tracked for Neural Networks');

    // Update session activity
    await axios.post('http://localhost:3001/api/analytics/activity', {
      sessionId,
      messageCount: 5,
      questionCount: 2
    }, { headers });
    console.log('✅ Session activity updated');

    // End the session
    await axios.post('http://localhost:3001/api/analytics/session/end', {
      sessionId,
      topicsDiscussed: ['Neural Networks', 'Deep Learning'],
      conceptsLearned: ['neurons', 'layers', 'activation functions']
    }, { headers });
    console.log('✅ Analytics session ended');

    // Get analytics dashboard
    const analyticsResponse = await axios.get('http://localhost:3001/api/analytics/dashboard?days=30', { headers });
    console.log('✅ Analytics dashboard retrieved:', {
      overallProgress: analyticsResponse.data.data.overallProgress,
      topicsCompleted: analyticsResponse.data.data.topicsCompleted,
      totalTimeSpent: analyticsResponse.data.data.totalTimeSpent,
      engagementScore: analyticsResponse.data.data.engagementScore,
      streakDays: analyticsResponse.data.data.streakDays
    });

    // Get topic progress
    const topicProgressResponse = await axios.get('http://localhost:3001/api/analytics/topics', { headers });
    console.log('✅ Topic progress retrieved:', topicProgressResponse.data.data.length, 'topics');

    console.log('\n🎉 All enhancement tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Profile management working');
    console.log('✅ Learning interests tracking working');
    console.log('✅ Analytics session tracking working');
    console.log('✅ Progress tracking working');
    console.log('✅ Dashboard analytics working');

  } catch (error) {
    console.error('\n❌ Enhancement test failed:', error.message);
    
    if (error.response) {
      console.log('API Error:', error.response.status, error.response.data);
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure backend is running: npm run dev:backend');
    console.log('2. Check MongoDB is running and connected');
    console.log('3. Verify all new routes are properly registered');
  }
}

testEnhancements();