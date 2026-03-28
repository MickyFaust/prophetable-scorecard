const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const PASSWORD = 'Dravrah1!1';
const DATA_PATH = '/app/data/plays.json';
const PENDING_PATH = '/app/data/pending.json';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- PUBLIC ROUTES ---
app.get('/api/plays', (req, res) => {
    if (fs.existsSync(DATA_PATH)) {
        try { res.json(JSON.parse(fs.readFileSync(DATA_PATH))); } catch (e) { res.json([]); }
    } else { res.json([]); }
});

// --- PYTHON BOT INTEGRATION ROUTES ---
// The Python bots hit this to read and write pending plays
app.get('/api/scorecard', (req, res) => {
    if (fs.existsSync(PENDING_PATH)) {
        try { res.json(JSON.parse(fs.readFileSync(PENDING_PATH))); } catch (e) { res.json({ pending_plays: [] }); }
    } else { res.json({ pending_plays: [] }); }
});

app.post('/api/scorecard', (req, res) => {
    // Python bot uses Bearer token, web frontend uses body password
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${PASSWORD}` && req.body.password !== PASSWORD) {
        return res.status(401).send('Unauthorized');
    }
    
    const dir = path.dirname(PENDING_PATH);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    
    fs.writeFileSync(PENDING_PATH, JSON.stringify(req.body, null, 2));
    res.status(200).send('Pending Queue Updated');
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
            const play = pendingPlays[index];
            let plays = [];
            if (fs.existsSync(DATA_PATH)) { plays = JSON.parse(fs.readFileSync(DATA_PATH)); }
            
            // Format for official scorecard
            plays.push({
                id: Date.now(),
                date: play.date,
                league: play.league || play.sport,
                tier: play.tier.toUpperCase().includes('ELITE') ? 'PROPHET ELITE' : 'MAX PROPHET',
                matchup: play.away_team && play.home_team ? `${play.away_team} @ ${play.home_team}` : play.matchup || play.pick,
                pick: play.pick,
                odds: play.juice ? play.juice.toString() : (play.odds || "-110"),
                units: parseFloat(units)
            });
            fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));

            // Remove from queue
            pendingPlays.splice(index, 1);
            data.pending_plays = pendingPlays;
            fs.writeFileSync(PENDING_PATH, JSON.stringify(data, null, 2));
            
            return res.status(200).send('Approved');
        }
    }
    res.status(404).send('Not found');
});

app.delete('/admin/delete-pending/:index', (req, res) => {
    const { password } = req.body;
    const index = parseInt(req.params.index);
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');

    if (fs.existsSync(PENDING_PATH)) {
        let data = JSON.parse(fs.readFileSync(PENDING_PATH));
        let pendingPlays = data.pending_plays || [];
        
        if (index >= 0 && index < pendingPlays.length) {
            pendingPlays.splice(index, 1);
            data.pending_plays = pendingPlays;
            fs.writeFileSync(PENDING_PATH, JSON.stringify(data, null, 2));
            return res.status(200).send('Deleted');
        }
    }
    res.status(404).send('Not found');
});

app.listen(PORT, "0.0.0.0", () => { console.log('Syndicate Engine Active'); });
