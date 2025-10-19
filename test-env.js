// Test environment variable loading
// Run with: node test-env.js

require('dotenv').config({ path: './backend/.env' });

console.log('🔍 Testing Environment Variables\n');

console.log('Environment variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'Not set');

if (process.env.OPENAI_API_KEY) {
  console.log('OPENAI_API_KEY starts with:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');
} else {
  console.log('❌ OPENAI_API_KEY is not set!');
}

console.log('\nAll environment variables:');
Object.keys(process.env).filter(key => key.includes('OPENAI')).forEach(key => {
  console.log(`${key}:`, process.env[key] ? 'Set' : 'Not set');
});