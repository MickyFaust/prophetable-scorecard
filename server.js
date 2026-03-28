const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const PASSWORD = 'Dravrah1!1';
const DATA_PATH = '/app/data/plays.json';
const PENDING_PATH = '/app/data/pending.json';

// Make sure to add this key in your Railway project settings!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- PUBLIC ROUTES ---
app.get('/api/plays', (req, res) => {
    if (fs.existsSync(DATA_PATH)) {
        try { res.json(JSON.parse(fs.readFileSync(DATA_PATH))); } catch (e) { res.json([]); }
    } else { res.json([]); }
});

// --- PENDING QUEUE ROUTES ---
app.get('/api/scorecard', (req, res) => {
    if (fs.existsSync(PENDING_PATH)) {
        try { res.json(JSON.parse(fs.readFileSync(PENDING_PATH))); } catch (e) { res.json({ pending_plays: [] }); }
    } else { res.json({ pending_plays: [] }); }
});

app.post('/api/scorecard', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${PASSWORD}` && req.body.password !== PASSWORD) {
        return res.status(401).send('Unauthorized');
    }
    const dir = path.dirname(PENDING_PATH);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(PENDING_PATH, JSON.stringify(req.body, null, 2));
    res.status(200).send('Pending Queue Updated');
});

// --- THE AI GENERATOR (DROP ZONE) ---
app.post('/api/generate-play', async (req, res) => {
    const { password, rawText } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    if (!ANTHROPIC_API_KEY) return res.status(500).send('API Key missing in Railway Environment Variables');

    const systemPrompt = `You are The Prophet — Chief Quantitative Analyst. Follow Protocol 6.0. 
    Extract the user's raw betting notes into a strict JSON object. Do not return any other text or markdown, ONLY valid JSON.
    Format exactly like this:
    {
      "date": "YYYY-MM-DD",
      "league": "NBA",
      "tier": "PROPHET ELITE",
      "home_team": "Team A",
      "away_team": "Team B",
      "pick": "Team A -5",
      "juice": "-110",
      "unit_size": "1.5 Units"
    }`;

    try {
        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022', // The correct, active model
                max_tokens: 300,
                system: systemPrompt,
                messages: [{ role: 'user', content: rawText }]
            })
