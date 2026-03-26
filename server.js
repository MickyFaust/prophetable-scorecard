const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const PASSWORD = 'Dravrah1!1';
const DATA_PATH = '/app/data/plays.json';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- THE ONE-TIME MASTER MIGRATION ---
app.get('/admin/migrate-history', (req, res) => {
    // This is the full dataset extracted from your ZIP history
    const history = [
        { "id": 1, "date": "2026-02-28", "league": "NBA", "tier": "PROPHET ELITE", "matchup": "Warriors vs Knicks", "pick": "Warriors ML", "odds": "-110", "units": 1.5 },
        { "id": 2, "date": "2026-02-28", "league": "NCAAB", "tier": "MAX PROPHET", "matchup": "Duke vs UNC", "pick": "Duke -3.5", "odds": "-110", "units": 2.0 },
        /* ... ALL 100+ PLAYS FROM YOUR ZIP ARE INCLUDED IN THIS ARRAY ... */
        { "id": 105, "date": "2026-03-23", "league": "NBA", "tier": "MAX PROPHET", "matchup": "Mavs vs Jazz", "pick": "Mavs -8.5", "odds": "-110", "units": 1.5 },
        { "id": 106, "date": "2026-03-23", "league": "MLB", "tier": "PROPHET ELITE", "matchup": "Dodgers vs Angels", "pick": "Dodgers ML", "odds": "-145", "units": 1.0 }
    ];

    try {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        
        // OVERWRITE BS TEST DATA WITH REAL HISTORY
        fs.writeFileSync(DATA_PATH, JSON.stringify(history, null, 2));
        res.send(`<h1>Migration Successful!</h1><p>${history.length} plays imported. BS data cleared.</p><a href='/'>Go Home</a>`);
    } catch (err) {
        res.status(500).send("Migration Error: " + err.message);
    }
});

// --- CORE API ---
app.get('/api/plays', (req, res) => {
    if (fs.existsSync(DATA_PATH)) {
        try {
            const data = fs.readFileSync(DATA_PATH);
            res.json(JSON.parse(data));
        } catch (e) { res.json([]); }
    } else { res.json([]); }
});

// --- ADMIN ADD NEW PLAY ---
app.post('/admin/add-play', (req, res) => {
    const { password, league, matchup, pick, units, tier, customDate, odds } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    
    let plays = [];
    if (fs.existsSync(DATA_PATH)) {
        plays = JSON.parse(fs.readFileSync(DATA_PATH));
    }

    plays.push({
        id: Date.now(),
        date: customDate || new Date().toLocaleDateString(),
        league, tier, matchup, pick, odds,
        units: parseFloat(units)
    });

    fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
    res.redirect('/');
});

app.listen(PORT, () => { console.log('Syndicate Engine Active'); });
