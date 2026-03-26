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

app.get('/admin/migrate-history', (req, res) => {
    const history = [
        {"id":1,"date":"2026-02-28","league":"NBA","tier":"PROPHET ELITE","matchup":"Lakers vs Clippers","pick":"Lakers +3.5","odds":"-110","units":1.0},
        {"id":2,"date":"2026-02-28","league":"NCAAB","tier":"MAX PROPHET","matchup":"Duke vs UNC","pick":"Duke -4.5","odds":"-115","units":2.0},
        {"id":3,"date":"2026-03-01","league":"NBA","tier":"PROPHET ELITE","matchup":"Celtics vs Mavericks","pick":"Mavs +6.5","odds":"-110","units":1.0},
        {"id":4,"date":"2026-03-01","league":"NBA","tier":"MAX PROPHET","matchup":"Suns vs Thunder","pick":"Suns ML","odds":"+105","units":1.5},
        {"id":5,"date":"2026-03-24","league":"NBA","tier":"MAX PROPHET","matchup":"Warriors vs Heat","pick":"Warriors -2.5","odds":"-110","units":1.5},
        {"id":6,"date":"2026-03-24","league":"NBA","tier":"PROPHET ELITE","matchup":"Knicks vs Heat","pick":"Over 225.5","odds":"-105","units":1.25}
    ];

    try {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(DATA_PATH, JSON.stringify(history, null, 2));
        res.send(`<h1>Migration Successful!</h1><p>History Loaded. Service Restored.</p><a href='/'>Go Home</a>`);
    } catch (err) {
        res.status(500).send("Error: " + err.message);
    }
});

app.get('/api/plays', (req, res) => {
    if (fs.existsSync(DATA_PATH)) {
        try { res.json(JSON.parse(fs.readFileSync(DATA_PATH))); } catch (e) { res.json([]); }
    } else { res.json([]); }
});

app.post('/admin/add-play', (req, res) => {
    const { password, league, matchup, pick, units, tier, customDate, odds } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    let plays = [];
    if (fs.existsSync(DATA_PATH)) { try { plays = JSON.parse(fs.readFileSync(DATA_PATH)); } catch(e) {} }
    plays.push({ id: Date.now(), date: customDate, league, tier, matchup, pick, odds, units: parseFloat(units) });
    fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
    res.redirect('/');
});

app.listen(PORT, () => { console.log('Syndicate Engine Active'); });
