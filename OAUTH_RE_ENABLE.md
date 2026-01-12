# OAuth Re-Enable Guide

This document explains how to re-enable Google and Apple OAuth login buttons in the frontend after you've obtained the necessary API keys.

## 📋 Current Status

- ✅ **Backend**: OAuth routes are fully implemented and ready (`backend/src/routes/oauthRoutes.ts`)
- ✅ **Dependencies**: `google-auth-library` is installed
- ❌ **Frontend**: OAuth buttons are currently commented out/removed from Login and Register pages

## 🔧 Steps to Re-Enable OAuth

### 1. Configure Environment Variables

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

Add this to your frontend `.env` file:

```env
REACT_APP_APPLE_CLIENT_ID=your_apple_client_id_here
REACT_APP_API_URL=http://localhost:5000
```

### 2. Re-Enable Google Login Button

In `frontend/src/pages/Login.tsx`, add this code **after** the main login button (around line 96):

```tsx
        {/* ✅ OAuth Login Buttons */}
        <div className="relative pt-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] text-white/50">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                // Redirect to backend OAuth endpoint
                window.location.href = `${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/auth/google`;
              }}
              className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2 md:py-1.5 text-xs hover:bg-white/10 transition-colors min-h-[44px] sm:min-h-0 touch-manipulation flex items-center justify-center gap-2"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="hidden sm:inline">Continue with Google</span>
              <span className="sm:hidden">Google</span>
            </button>
            {/* Apple button code goes here (see next section) */}
          </div>
        </div>
```

### 3. Re-Enable Apple Login Button

Add this button **inside** the same `<div className="mt-3 grid...">` container (right after the Google button):

```tsx
            <button
              type="button"
              onClick={async () => {
                try {
                  // ✅ Apple Sign In (requires Apple JS SDK)
                  if (!window.AppleID) {
                    alert("Apple Sign In SDK not loaded. Please refresh the page or use Google login.");
                    return;
                  }

                  // Initialize Apple Sign In
                  const appleClientId = process.env.REACT_APP_APPLE_CLIENT_ID;
                  if (!appleClientId) {
                    alert("Apple Sign In not configured. Please use Google or email/password.");
                    return;
                  }

                  window.AppleID.auth.init({
                    clientId: appleClientId,
                    scope: "name email",
                    redirectURI: `${window.location.origin}/auth/callback`,
                    usePopup: false,
                  });

                  // Sign in with Apple
                  const response = await window.AppleID.auth.signIn({
                    requestedScopes: ["name", "email"],
                  });

                  // Send to backend
                  const backendResponse = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/auth/apple`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      identityToken: response.id_token,
                      authorizationCode: response.code,
                      user: response.user,
                    }),
                  });
                  
                  if (backendResponse.ok) {
                    const data = await backendResponse.json();
                    localStorage.setItem("token", data.token);
                    window.location.href = "/dashboard";
                  } else {
                    const error = await backendResponse.json();
                    alert(error.error || "Apple Sign In failed");
                  }
                } catch (error: any) {
                  console.error("Apple login error:", error);
                  alert(error.message || "Apple Sign In failed. Please try again or use Google login.");
                }
              }}
              className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2 md:py-1.5 text-xs hover:bg-white/10 transition-colors min-h-[44px] sm:min-h-0 touch-manipulation flex items-center justify-center gap-2"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <span className="hidden sm:inline">Continue with Apple</span>
              <span className="sm:hidden">Apple</span>
            </button>
```

### 4. Add Apple TypeScript Declaration

Make sure `frontend/src/react-app-env.d.ts` includes:

```typescript
declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }) => void;
        signIn: (config: {
          requestedScopes: string[];
        }) => Promise<{
          id_token: string;
          code: string;
          user?: {
            email?: string;
            name?: {
              firstName?: string;
              lastName?: string;
            };
          };
        }>;
      };
    };
  }
}

export {};
```

### 5. Ensure Apple SDK is Loaded

Verify that `frontend/public/index.html` includes the Apple Sign In SDK:

```html
<script type="text/javascript" src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid.auth.js"></script>
```

### 6. Apply Same Changes to Register Page

Repeat steps 2-3 in `frontend/src/pages/Register.tsx`, but change button text to:
- "Sign up with Google" (instead of "Continue with Google")
- "Sign up with Apple" (instead of "Continue with Apple")

## 📚 Additional Resources

- See `OAUTH_SETUP.md` for detailed setup instructions for Google Cloud and Apple Developer accounts
- See `OAUTH_QUICK_START.md` for a condensed setup guide

## ✅ Testing Checklist

After re-enabling:

- [ ] Google login button appears on Login page
- [ ] Google login button appears on Register page
- [ ] Apple login button appears on Login page
- [ ] Apple login button appears on Register page
- [ ] Clicking Google button redirects to Google OAuth
- [ ] Clicking Apple button opens Apple Sign In modal
- [ ] OAuth callback redirects to `/auth/callback`
- [ ] User is redirected to dashboard after successful OAuth login
- [ ] JWT token is stored in localStorage
- [ ] User can access dashboard after OAuth login

## 🔍 Troubleshooting

**Google OAuth not working:**
- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in backend `.env`
- Verify redirect URI matches Google Cloud Console settings
- Check backend logs for OAuth errors

**Apple Sign In not working:**
- Check that `REACT_APP_APPLE_CLIENT_ID` is set in frontend `.env`
- Verify Apple SDK script is loaded in `index.html`
- Check browser console for Apple SDK errors
- Ensure Apple Developer account is properly configured

**Backend routes not found:**
- Verify `oauthRoutes` are registered in `backend/src/index.ts`
- Restart backend server after adding environment variables
