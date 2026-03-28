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
                model: 'claude-sonnet-4-5-20250929', // Upgraded to the active 2026 Sonnet 4.5 model
                max_tokens: 300,
                system: systemPrompt,
                messages: [{ role: 'user', content: rawText }]
            })
        });

        const data = await aiResponse.json();

        // If Anthropic rejects the request, log the exact reason and send it to the UI.
        if (!aiResponse.ok) {
            console.error("Anthropic Rejected the API Call:", data);
            return res.status(500).send(`Anthropic Error: ${data.error?.message || 'Check Railway Logs'}`);
        }

        const extractedJson = JSON.parse(data.content[0].text);

        // Load current pending queue and add the new AI-generated play
        let pendingData = { pending_plays: [] };
        if (fs.existsSync(PENDING_PATH)) {
            pendingData = JSON.parse(fs.readFileSync(PENDING_PATH));
        }
        
        pendingData.pending_plays.push(extractedJson);
        fs.writeFileSync(PENDING_PATH, JSON.stringify(pendingData, null, 2));

        res.status(200).json(extractedJson);
    } catch (err) {
        console.error("AI Generation/Parsing Error:", err);
        res.status(500).send('Failed to generate or parse play from AI.');
    }
});

// --- ADMIN ROUTES (ADD, EDIT, DELETE OFFICIAL PLAYS) ---
app.post('/admin/add-play', (req, res) => {
    const { password, league, matchup, pick, units, tier, customDate, odds } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    let plays = [];
    if (fs.existsSync(DATA_PATH)) { try { plays = JSON.parse(fs.readFileSync(DATA_PATH)); } catch(e) {} }
    plays.push({ id: Date.now(), date: customDate, league, tier, matchup, pick, odds, units: parseFloat(units) });
    fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
    res.redirect('/');
});

app.put('/admin/edit-play/:id', (req, res) => {
    const { password, customDate, tier, league, matchup, pick, odds, units } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    if (fs.existsSync(DATA_PATH)) {
        let plays = JSON.parse(fs.readFileSync(DATA_PATH));
        const playIndex = plays.findIndex(p => p.id === parseInt(req.params.id));
        if (playIndex !== -1) {
            plays[playIndex] = { ...plays[playIndex], date: customDate, tier, league, matchup, pick, odds, units: parseFloat(units) };
            fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
            return res.status(200).send('Updated');
        }
    }
    res.status(404).send('Not found');
});

app.delete('/admin/delete-play/:id', (req, res) => {
    const { password } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    if (fs.existsSync(DATA_PATH)) {
        let plays = JSON.parse(fs.readFileSync(DATA_PATH));
        plays = plays.filter(p => p.id !== parseInt(req.params.id));
        fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
        return res.status(200).send('Deleted');
    }
    res.status(404).send('Not found');
});

// --- PENDING QUEUE MANAGEMENT ROUTES ---
app.post('/admin/approve-pending/:index', (req, res) => {
    const { password, units } = req.body;
    const index = parseInt(req.params.index);
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');

    if (fs.existsSync(PENDING_PATH)) {
        let data = JSON.parse(fs.readFileSync(PENDING_PATH));
        let pendingPlays = data.pending_plays || [];
        
        if (index >= 0 && index < pendingPlays.length) {
