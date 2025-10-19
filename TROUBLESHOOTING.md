# 🔧 ML-E Login Troubleshooting Guide

## 🚨 Login Issue Fixed!

The login issue has been resolved. There was a mismatch between frontend and backend authentication:

- **Frontend** was sending `username` 
- **Backend** was expecting `email`

### ✅ What Was Fixed:

1. **Backend now accepts both username AND email** for login
2. **Default test user is automatically created** on server startup
3. **Frontend can handle both username and email** login formats
4. **Validation schemas updated** to accept both formats

## 🎯 Default Login Credentials

When you start the server, a default user is automatically created:

```
Username: student
Email: student@example.com  
Password: password123
Grade: 10
```

**You can login with EITHER:**
- Username: `student` + Password: `password123`
- Email: `student@example.com` + Password: `password123`

## 🧪 Test Your Setup

Run this quick test to verify everything works:

```bash
# Make sure your backend is running first
npm run dev:backend

# Then in another terminal, run the test
node test-login.js
```

## 🔍 Step-by-Step Troubleshooting

### 1. Check Services Are Running

```bash
# Check MongoDB
brew services list | grep mongodb  # macOS
sudo systemctl status mongod       # Linux

# Check Redis  
brew services list | grep redis    # macOS
sudo systemctl status redis        # Linux

# Test connections
mongo --eval "db.adminCommand('ismaster')"  # MongoDB
redis-cli ping                              # Redis (should return PONG)
```

### 2. Check Backend Server

```bash
# Start backend
npm run dev:backend

# Should see logs like:
# "MongoDB connection established"
# "Redis connection established" 
# "Default test user created"
# "ML-E Backend server running on port 3001"
```

### 3. Test API Endpoints

```bash
# Health checks
curl http://localhost:3001/health           # Main health endpoint
curl http://localhost:3001/api/health       # API health endpoint  
curl http://localhost:3001/api/health/liveness   # Liveness probe
curl http://localhost:3001/api/health/readiness  # Readiness probe

# Test login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"student","password":"password123"}'

# Or run the health test script
node test-health.js
```

### 4. Check Frontend

```bash
# Start frontend
npm run dev:frontend

# Visit http://localhost:3000
# Try logging in with: student / password123
```

## 🐛 Common Issues & Solutions

### Issue: "Cannot connect to MongoDB"
**Solution:**
```bash
# Start MongoDB
brew services start mongodb-community  # macOS
sudo systemctl start mongod            # Linux

# Or manually:
mongod --dbpath /usr/local/var/mongodb
```

### Issue: "Cannot connect to Redis"  
**Solution:**
```bash
# Start Redis
brew services start redis              # macOS
sudo systemctl start redis-server      # Linux

# Or manually:
redis-server
```

### Issue: "Invalid credentials" 
**Solutions:**
1. Use the default credentials: `student` / `password123`
2. Check server logs for "Default test user created"
3. Try both username AND email formats
4. Restart the backend to recreate the default user

### Issue: "Port 3001 already in use"
**Solution:**
```bash
# Kill process on port 3001
npx kill-port 3001

# Or find and kill manually
lsof -ti:3001 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :3001   # Windows
```

### Issue: "OpenAI API errors"
**Note:** OpenAI is only needed for AI features, not for login. Login should work without it.

**If you want AI features:**
1. Get API key from https://platform.openai.com/api-keys
2. Add to `backend/.env`: `OPENAI_API_KEY=sk-your-key-here`

## 📋 Environment Checklist

Make sure your `backend/.env` has:

```env
# Database (Required)
MONGODB_URI=mongodb://localhost:27017/ml-e-tutoring
REDIS_URL=redis://localhost:6379

# Auth (Required)  
JWT_SECRET=ml-e-super-secret-jwt-key-for-development-only-change-in-production-2024
JWT_REFRESH_SECRET=ml-e-super-secret-refresh-key-for-development-only-change-in-production-2024

# Server (Required)
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# AI (Optional for login, required for tutoring)
OPENAI_API_KEY=your-openai-api-key-here
```

## 🎯 Quick Success Test

If everything is working, you should be able to:

1. ✅ Visit http://localhost:3001/api/health → See `{"status":"ok"}`
2. ✅ Visit http://localhost:3000 → See login page
3. ✅ Login with `student` / `password123` → Redirected to chat
4. ✅ See "Welcome to ML-E" in the chat interface

## 🆘 Still Having Issues?

If you're still having problems:

1. **Check the browser console** for JavaScript errors
2. **Check the backend logs** for error messages  
3. **Run the test script**: `node test-login.js`
4. **Restart everything**:
   ```bash
   # Kill all processes
   npx kill-port 3000 3001
   
   # Restart services
   brew services restart mongodb-community redis  # macOS
   
   # Restart app
   npm run dev
   ```

The login functionality is now robust and should work reliably!