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
    res.send("Migration route active.");
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

// NEW: Edit Route
app.put('/admin/edit-play/:id', (req, res) => {
    const { password, customDate, tier, league, matchup, pick, odds, units } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    
    if (fs.existsSync(DATA_PATH)) {
        let plays = JSON.parse(fs.readFileSync(DATA_PATH));
        const playIndex = plays.findIndex(p => p.id === parseInt(req.params.id));
        
        if (playIndex !== -1) {
            plays[playIndex] = {
                ...plays[playIndex],
                date: customDate,
                tier,
                league,
                matchup,
                pick,
                odds,
                units: parseFloat(units)
            };
            fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
            return res.status(200).send('Updated successfully');
        }
    }
    res.status(404).send('Play not found');
});

// Delete Route
app.delete('/admin/delete-play/:id', (req, res) => {
    const { password } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    
    if (fs.existsSync(DATA_PATH)) {
        let plays = JSON.parse(fs.readFileSync(DATA_PATH));
        const initialLength = plays.length;
        plays = plays.filter(p => p.id !== parseInt(req.params.id));
        
        if (plays.length < initialLength) {
            fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
            return res.status(200).send('Deleted successfully');
        }
    }
    res.status(404).send('Play not found');
});

app.listen(PORT, "0.0.0.0", () => { console.log('Syndicate Engine Active'); });
