# Google Sign-In Setup (Customer Login)

You said you have no prior experience with this — here's the simplest realistic path. We're
using **NextAuth.js** (also called Auth.js), a library that does almost all of the hard OAuth
work for you. You mostly just need to get two values from Google and paste them in.

This only applies to **customer** login. Admins log in with a separate email/password system
that has nothing to do with Google — see `HITL.md` for why they're kept apart.

## 1. Get credentials from Google (one-time setup, ~10 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and sign in with any
   Google account (doesn't need to be a special "developer" account).
2. Top-left, click the project dropdown → **New Project**. Name it something like
   "Senhill Holiday Resort". Click Create.
3. Left sidebar → **APIs & Services** → **OAuth consent screen**.
   - User type: **External** (this is correct even though only your customers will use it —
     "External" just means "not restricted to a Google Workspace organization").
   - Fill in: App name (`Senhill Holiday Resort`), your email as support contact, your email
     again as developer contact. Save and continue through the remaining screens — you can
     leave scopes/test users as default for now.
4. Left sidebar → **APIs & Services** → **Credentials** → **+ Create Credentials** →
   **OAuth client ID**.
   - Application type: **Web application**.
   - Name: anything, e.g. "Senhill Website".
   - **Authorized redirect URIs** — this is the one field that must be exact. Add:
     - `http://localhost:3000/api/auth/callback/google` (for local development)
     - `https://your-vercel-domain.vercel.app/api/auth/callback/google` (add this once you
       know your real Vercel URL — you can add it later and redeploy, doesn't need to be right
       on day one)
   - Click Create.
5. A popup shows your **Client ID** and **Client Secret**. Copy both somewhere safe — you'll
   paste them into environment variables next. (You can always come back to this same
   Credentials page later if you lose them.)

## 2. Add them to the project

In your project's `.env.local` file (never commit this file to git):
```
GOOGLE_CLIENT_ID=<paste the Client ID here>
GOOGLE_CLIENT_SECRET=<paste the Client Secret here>
NEXTAUTH_SECRET=<any long random string — generate one at https://generate-secret.vercel.app/32>
NEXTAUTH_URL=http://localhost:3000
```

When you deploy to Vercel, add the same variables in Vercel's project settings (Settings →
Environment Variables), with `NEXTAUTH_URL` set to your real production URL instead.

## 3. What NextAuth handles for you automatically
Once the above is set up and the code is wired in (I'll do this part when we build), you get:
- A working "Sign in with Google" button with no custom UI needed to start
- Session cookies, token refresh, and sign-out — all handled by the library
- A `session.user` object in your app with the customer's name/email, ready to use

You do **not** need to:
- Write any token-verification code yourself
- Handle refresh tokens manually
- Store Google tokens in your own database (NextAuth manages the session)

## 4. What still needs a decision from you later
- Whether to also collect the customer's **phone number** on first login (Google doesn't
  reliably provide one) — likely a simple "add your phone" prompt the first time they try to
  book, similar to the earlier hotel project.

## Troubleshooting note for later
If Google shows a "redirect_uri_mismatch" error when testing, it almost always means the URL in
your browser doesn't exactly match one of the Authorized Redirect URIs in step 1 (including
`http` vs `https`, and the exact `/api/auth/callback/google` path). Fix it there, not in code.
