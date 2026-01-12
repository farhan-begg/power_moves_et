# OAuth Setup Guide (Google & Apple Login)

This guide will help you set up Google and Apple OAuth authentication for your application.

## 📋 Prerequisites

1. **Google OAuth Setup**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Google+ API
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
   - Add authorized redirect URIs:
     - `http://localhost:5000/api/auth/google/callback` (development)
     - `https://yourdomain.com/api/auth/google/callback` (production)
   - Copy Client ID and Client Secret

2. **Apple OAuth Setup**:
   - Go to [Apple Developer Portal](https://developer.apple.com/)
   - Create an App ID
   - Create a Services ID for Sign in with Apple
   - Configure redirect URLs:
     - `http://localhost:5000/api/auth/apple/callback` (development)
     - `https://yourdomain.com/api/auth/apple/callback` (production)
   - Create a Key for Sign in with Apple
   - Download the key file (.p8)
   - Copy Team ID, Client ID, Key ID

## 🔧 Environment Variables

Add these to your `.env` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Apple OAuth
APPLE_CLIENT_ID=your_apple_client_id
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
APPLE_PRIVATE_KEY_PATH=./path/to/AuthKey_XXXXX.p8

# OAuth Redirect URLs
OAUTH_REDIRECT_URL=http://localhost:3000/auth/callback
```

## 📦 Installation

### Backend Dependencies
```bash
cd backend
npm install google-auth-library
```

### Frontend
No additional dependencies needed - Apple Sign In SDK is loaded via CDN in `index.html`.

### Environment Variables
Add these to your `.env` file in the backend:

```env
# Google OAuth (Required for Google login)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Apple OAuth (Required for Apple login)
APPLE_CLIENT_ID=your_apple_client_id_here
APPLE_TEAM_ID=your_apple_team_id_here
APPLE_KEY_ID=your_apple_key_id_here
APPLE_PRIVATE_KEY_PATH=./path/to/AuthKey_XXXXX.p8

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:3000
# Or in production:
# FRONTEND_URL=https://yourdomain.com
```

## 🚀 Usage

1. **Backend**: OAuth routes are automatically registered
2. **Frontend**: Click "Continue with Google" or "Continue with Apple" buttons
3. **Flow**: User → OAuth Provider → Callback → JWT Token → Dashboard

## 🔒 Security Notes

- OAuth tokens are handled server-side only
- JWT tokens are generated the same way as email/password login
- Users can link OAuth accounts to existing email/password accounts
- OAuth users don't need passwords (optional field)
