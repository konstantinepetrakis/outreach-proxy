// v1.1.0 - adds OAuth callback handler and popup postMessage flow
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');

// In-memory store for OAuth state
const oauthSessions = {};

const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.1.0' });
});

// ── ZeroBounce: validate single email ─────────────────────────
app.get('/api/zerobounce/validate', async (req, res) => {
  const { email, api_key } = req.query;
  if (!email || !api_key) return res.status(400).json({ error: 'Missing email or api_key' });
  try {
    const response = await axios.get('https://api.zerobounce.net/v2/validate', {
      params: { api_key, email },
      timeout: 10000,
    });
    res.json(response.data);
  } catch (err) {
    const msg = err.response?.data || err.message;
    res.status(500).json({ error: msg });
  }
});

// ── ZeroBounce: check credits ─────────────────────────────────
app.get('/api/zerobounce/credits', async (req, res) => {
  const { api_key } = req.query;
  if (!api_key) return res.status(400).json({ error: 'Missing api_key' });
  try {
    const response = await axios.get('https://api.zerobounce.net/v2/getcredits', {
      params: { api_key },
      timeout: 8000,
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ── Gmail OAuth: generate auth URL ───────────────────────────
app.post('/api/gmail/auth-url', (req, res) => {
  const { client_id, client_secret } = req.body;
  if (!client_id || !client_secret) return res.status(400).json({ error: 'Missing client_id or client_secret' });

  const redirectUri = `${req.protocol}://${req.get('host')}/oauth2callback`;
  const state = Math.random().toString(36).substring(2);
  oauthSessions[state] = { client_id, client_secret };

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent',
    state,
  });
  res.json({ url });
});

// ── Gmail OAuth: callback handler ─────────────────────────────
app.get('/oauth2callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type: 'GMAIL_AUTH_ERROR', error: '${error}' }, '*');
      window.close();
    </script><p>Authorization failed. You can close this window.</p></body></html>`);
  }

  const session = oauthSessions[state];
  if (!session) {
    return res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type: 'GMAIL_AUTH_ERROR', error: 'Invalid session' }, '*');
      window.close();
    </script><p>Invalid session. Please try again.</p></body></html>`);
  }

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/oauth2callback`;
    const oauth2Client = new google.auth.OAuth2(session.client_id, session.client_secret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress;

    delete oauthSessions[state];

    res.send(`<html><body><script>
      window.opener && window.opener.postMessage({
        type: 'GMAIL_AUTH_SUCCESS',
        tokens: ${JSON.stringify(tokens)},
        email: '${email}'
      }, '*');
      window.close();
    </script><p>Connected as ${email}! You can close this window.</p></body></html>`);
  } catch (err) {
    res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type: 'GMAIL_AUTH_ERROR', error: '${err.message.replace(/'/g, "\\'")}' }, '*');
      window.close();
    </script><p>Error: ${err.message}</p></body></html>`);
  }
});

// ── Gmail: send one email ─────────────────────────────────────
app.post('/api/gmail/send', async (req, res) => {
  const { client_id, client_secret, tokens, to, subject, body, from_name } = req.body;
  if (!client_id || !client_secret || !tokens || !to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const profile = await gmail.users.getProfile({ userId: 'me' });
    const fromEmail = profile.data.emailAddress;
    const fromHeader = from_name ? `${from_name} <${fromEmail}>` : fromEmail;
    const raw = makeRawEmail({ to, subject, body, from: fromHeader });

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Gmail: get sender email address ──────────────────────────
app.post('/api/gmail/profile', async (req, res) => {
  const { client_id, client_secret, tokens } = req.body;
  try {
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    res.json({ email: profile.data.emailAddress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────
function makeRawEmail({ to, subject, body, from }) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];
  const message = messageParts.join('\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Outreach proxy running on port ${PORT}`));
