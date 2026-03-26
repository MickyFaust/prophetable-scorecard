const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const DATA_PATH = '/app/data/plays.json'; // Railway Volume Path
const PORT = process.env.PORT || 8080;
const PASSWORD = process.env.ADMIN_PASSWORD || 'Dravrah1!1';

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the Scorecard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin Login/Dashboard Logic
app.post('/admin/add-play', (req, res) => {
    const { password, league, matchup, pick, units } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');

    let plays = [];
    if (fs.existsSync(DATA_PATH)) {
        plays = JSON.parse(fs.readFileSync(DATA_PATH));
    }
    
    plays.push({ date: new Date().toLocaleDateString(), league, matchup, pick, units });
    fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
    res.send('Play Recorded! Refresh your Scorecard.');
});

app.listen(PORT, () => console.log(`ProphetableX active on port ${PORT}`));
