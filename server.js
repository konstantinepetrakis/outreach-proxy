const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
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

// ── Gmail OAuth: get auth URL ─────────────────────────────────
app.post('/api/gmail/auth-url', (req, res) => {
  const { client_id, client_secret, redirect_uri } = req.body;
  if (!client_id || !client_secret) return res.status(400).json({ error: 'Missing client_id or client_secret' });
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri || 'http://localhost:3000/oauth2callback');
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent',
  });
  res.json({ url });
});

// ── Gmail OAuth: exchange code for tokens ─────────────────────
app.post('/api/gmail/token', async (req, res) => {
  const { client_id, client_secret, redirect_uri, code } = req.body;
  if (!client_id || !client_secret || !code) return res.status(400).json({ error: 'Missing fields' });
  try {
    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri || 'http://localhost:3000/oauth2callback');
    const { tokens } = await oauth2Client.getToken(code);
    res.json({ tokens });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const fromHeader = from_name ? `${from_name} <${tokens.email || ''}>` : tokens.email || '';
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
