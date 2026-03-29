# Outreach Proxy Server

A lightweight backend that proxies ZeroBounce email validation and Gmail sending for the Property Outreach Pipeline app. Solves browser CORS restrictions for both APIs.

---

## What this server does

- `/api/zerobounce/validate` — validates a single email via ZeroBounce
- `/api/zerobounce/credits` — checks your ZeroBounce credit balance
- `/api/gmail/auth-url` — generates a Gmail OAuth login URL
- `/api/gmail/token` — exchanges OAuth code for access tokens
- `/api/gmail/send` — sends one email via Gmail
- `/api/gmail/profile` — gets the connected Gmail address
- `/health` — health check endpoint

---

## Deploy to Railway (free, ~5 minutes)

### Step 1 — Create a GitHub repo

1. Go to github.com and create a new repository called `outreach-proxy`
2. Upload all files from this folder into it (drag and drop in the GitHub UI)

### Step 2 — Deploy on Railway

1. Go to railway.app and sign up (free tier is enough)
2. Click **New Project → Deploy from GitHub repo**
3. Select your `outreach-proxy` repo
4. Railway auto-detects Node.js and deploys — no config needed
5. Once deployed, click your service → **Settings → Networking → Generate Domain**
6. Copy your Railway URL — it will look like: `https://outreach-proxy-production-xxxx.up.railway.app`

### Step 3 — Set your proxy URL in the app

1. Open the Outreach Pipeline app
2. Go to ⚙ Settings
3. Paste your Railway URL into the **Proxy server URL** field
4. The app will now route all ZeroBounce and Gmail calls through your server

---

## Set up Gmail OAuth (for sending)

You need a Google Cloud project with the Gmail API enabled.

### Step 1 — Create Google Cloud project

1. Go to console.cloud.google.com
2. Create a new project (e.g. "Outreach Pipeline")
3. Go to **APIs & Services → Enable APIs**
4. Search for and enable **Gmail API**

### Step 2 — Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth Client ID**
3. Application type: **Web application**
4. Add authorized redirect URI: `https://your-railway-url.up.railway.app/oauth2callback`
5. Copy your **Client ID** and **Client Secret**

### Step 3 — Configure OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. User type: **External**
3. Fill in app name (e.g. "Outreach Pipeline"), your email
4. Add scope: `https://www.googleapis.com/auth/gmail.send`
5. Add your outreach Gmail address as a test user

### Step 4 — Connect in the app

1. In the app Settings, paste your Google Client ID and Client Secret
2. Click **Connect Gmail** — this opens Google's OAuth login
3. Sign in with your outreach Gmail account
4. Tokens are stored in your browser only — never on the server

---

## Local development

```bash
npm install
node server.js
# Server runs at http://localhost:3001
```

---

## Security notes

- API keys are passed per-request from the browser — never stored on the server
- Gmail OAuth tokens are stored in the browser only
- The server has no database and no persistent storage
- All CORS is open — if you want to restrict to your domain only, set the ALLOWED_ORIGIN env var in Railway
