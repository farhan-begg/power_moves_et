# OAuth Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### 1. **Google OAuth Setup**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure consent screen (if prompted)
6. Add authorized redirect URIs:
   - `http://localhost:5000/api/auth/google/callback` (development)
   - `https://yourdomain.com/api/auth/google/callback` (production)
7. Copy **Client ID** and **Client Secret**

### 2. **Apple OAuth Setup** (Optional)

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Create an **App ID** with "Sign in with Apple" capability
3. Create a **Services ID** for Sign in with Apple
4. Configure redirect URLs:
   - `http://localhost:3000/auth/callback` (development)
   - `https://yourdomain.com/auth/callback` (production)
5. Create a **Key** for Sign in with Apple
6. Download the `.p8` key file
7. Copy **Team ID**, **Client ID** (Services ID), and **Key ID**

### 3. **Install Dependencies**

```bash
cd backend
npm install google-auth-library
```

### 4. **Configure Environment Variables**

Add to `backend/.env`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Apple OAuth (optional)
APPLE_CLIENT_ID=your_apple_client_id
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
APPLE_PRIVATE_KEY_PATH=./keys/AuthKey_XXXXX.p8

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

Add to `frontend/.env` (optional, for Apple):

```env
REACT_APP_APPLE_CLIENT_ID=your_apple_client_id
```

### 5. **Test It!**

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm start`
3. Go to login page
4. Click "Continue with Google" → Should redirect to Google → Back to app → Logged in! ✅

## 📝 Notes

- **Google**: Works immediately after setup
- **Apple**: Requires Apple Developer account ($99/year)
- **OAuth users**: Don't need passwords (optional field)
- **Account linking**: If email exists, OAuth account links to existing account

## 🔧 Troubleshooting

### Google OAuth not working?
- Check redirect URI matches exactly (including http/https)
- Verify Client ID and Secret are correct
- Check browser console for errors

### Apple Sign In not working?
- Verify Apple JS SDK is loaded (check Network tab)
- Check `REACT_APP_APPLE_CLIENT_ID` is set
- Apple Sign In requires HTTPS in production

### "OAuth not configured" error?
- Check environment variables are set
- Restart backend server after adding env vars
- Verify `.env` file is in correct location

## 🎯 Next Steps

1. Test OAuth login flow
2. Verify users can access dashboard
3. Test account linking (same email, different providers)
4. Deploy with production URLs
