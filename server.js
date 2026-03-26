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

app.get('/api/plays', (req, res) => {
    if (fs.existsSync(DATA_PATH)) {
        const data = fs.readFileSync(DATA_PATH);
        res.json(JSON.parse(data));
    } else {
        res.json([]);
    }
});

app.post('/admin/add-play', (req, res) => {
    const { password, league, matchup, pick, units } = req.body;
    if (password !== PASSWORD) {
        return res.status(401).send('Unauthorized: Incorrect Syndicate Key');
    }
    let plays = [];
    if (fs.existsSync(DATA_PATH)) {
        plays = JSON.parse(fs.readFileSync(DATA_PATH));
    }
    const newPlay = {
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        league,
        matchup,
        pick,
        units: parseFloat(units)
    };
    plays.push(newPlay);
    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_PATH, JSON.stringify(plays, null, 2));
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log('Syndicate Engine Active');
});
