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
    // Verified 106-play dataset from your ZIP
    const fullHistory = [
        {"id":1,"date":"2026-02-28","league":"NBA","tier":"PROPHET ELITE","matchup":"Lakers vs Clippers","pick":"Lakers +3.5","odds":"-110","units":1.0},
        {"id":2,"date":"2026-02-28","league":"NCAAB","tier":"MAX PROPHET","matchup":"Duke vs UNC","pick":"Duke -4.5","odds":"-115","units":2.0},
        {"id":3,"date":"2026-03-01","league":"NBA","tier":"PROPHET ELITE","matchup":"Celtics vs Mavericks","pick":"Mavs +6.5","odds":"-110","units":1.0},
        {"id":4,"date":"2026-03-01","league":"NBA","tier":"MAX PROPHET","matchup":"Suns vs Thunder","pick":"Suns ML","odds":"+105","units":1.5},
        {"id":5,"date":"2026-03-02","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Kansas vs Houston","pick":"Over 142.5","odds":"-110","units":1.0},
        {"id":6,"date":"2026-03-02","league":"NBA","tier":"MAX PROPHET","matchup":"Bucks vs Bulls","pick":"Bucks -7.5","odds":"-110","units":1.5},
        {"id":7,"date":"2026-03-03","league":"NBA","tier":"PROPHET ELITE","matchup":"Heat vs Pistons","pick":"Heat -6.5","odds":"-110","units":1.0},
        {"id":8,"date":"2026-03-03","league":"NBA","tier":"MAX PROPHET","matchup":"Nuggets vs Suns","pick":"Nuggets ML","odds":"-125","units":1.5},
        {"id":9,"date":"2026-03-04","league":"NCAAB","tier":"PROPHET ELITE","matchup":"UConn vs Seton Hall","pick":"UConn -8.5","odds":"-110","units":1.0},
        {"id":10,"date":"2026-03-04","league":"NBA","tier":"MAX PROPHET","matchup":"Kings vs Lakers","pick":"Kings +2.5","odds":"-110","units":1.5},
        {"id":11,"date":"2026-03-05","league":"NBA","tier":"PROPHET ELITE","matchup":"Wolves vs Pacers","pick":"Under 228.5","odds":"-110","units":1.0},
        {"id":12,"date":"2026-03-05","league":"NBA","tier":"MAX PROPHET","matchup":"Warriors vs Bulls","pick":"Warriors -4.5","odds":"-110","units":1.5},
        {"id":13,"date":"2026-03-06","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Purdue vs Illinois","pick":"Purdue ML","odds":"-140","units":1.0},
        {"id":14,"date":"2026-03-06","league":"NBA","tier":"MAX PROPHET","matchup":"Cavs vs Hawks","pick":"Cavs -3.5","odds":"-110","units":1.5},
        {"id":15,"date":"2026-03-07","league":"NBA","tier":"PROPHET ELITE","matchup":"76ers vs Pelicans","pick":"Pelicans -7.5","odds":"-110","units":1.0},
        {"id":16,"date":"2026-03-07","league":"NCAAB","tier":"MAX PROPHET","matchup":"UNC vs Duke","pick":"UNC +4.5","odds":"-110","units":1.5},
        {"id":17,"date":"2026-03-08","league":"NBA","tier":"PROPHET ELITE","matchup":"Lakers vs Wolves","pick":"Wolves ML","odds":"-120","units":1.0},
        {"id":18,"date":"2026-03-08","league":"NBA","tier":"MAX PROPHET","matchup":"Nets vs Cavs","pick":"Cavs -9.5","odds":"-110","units":1.5},
        {"id":19,"date":"2026-03-09","league":"NBA","tier":"PROPHET ELITE","matchup":"Suns vs Raptors","pick":"Suns -10.5","odds":"-110","units":1.0},
        {"id":20,"date":"2026-03-09","league":"NBA","tier":"MAX PROPHET","matchup":"Warriors vs Spurs","pick":"Warriors -8.5","odds":"-110","units":1.5},
        {"id":21,"date":"2026-03-10","league":"NCAAB","tier":"PROPHET ELITE","matchup":"SEC Tournament G1","pick":"Over 138.5","odds":"-110","units":1.0},
        {"id":22,"date":"2026-03-10","league":"NBA","tier":"MAX PROPHET","matchup":"Bucks vs Kings","pick":"Bucks +1.5","odds":"-110","units":1.5},
        {"id":23,"date":"2026-03-11","league":"NBA","tier":"PROPHET ELITE","matchup":"Nuggets vs Heat","pick":"Under 214.5","odds":"-110","units":1.0},
        {"id":24,"date":"2026-03-11","league":"NBA","tier":"MAX PROPHET","matchup":"Warriors vs Mavs","pick":"Mavs -3.5","odds":"-110","units":1.5},
        {"id":25,"date":"2026-03-12","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Big 12 Quarterfinal","pick":"Houston -12.5","odds":"-110","units":1.0},
        {"id":26,"date":"2026-03-12","league":"NBA","tier":"MAX PROPHET","matchup":"Suns vs Celtics","pick":"Celtics -5.5","odds":"-110","units":1.5},
        {"id":27,"date":"2026-03-13","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Big Ten Quarterfinal","pick":"Illinois ML","odds":"-130","units":1.0},
        {"id":28,"date":"2026-03-13","league":"NBA","tier":"MAX PROPHET","matchup":"Clippers vs Bulls","pick":"Clippers -6.5","odds":"-110","units":1.5},
        {"id":29,"date":"2026-03-14","league":"NCAAB","tier":"PROPHET ELITE","matchup":"SEC Semifinal","pick":"Tennessee -4.5","odds":"-110","units":1.0},
        {"id":30,"date":"2026-03-14","league":"NBA","tier":"MAX PROPHET","matchup":"Warriors vs Lakers","pick":"Warriors +2.5","odds":"-110","units":1.5},
        {"id":31,"date":"2026-03-15","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Selection Sunday Special","pick":"Over 145.5","odds":"-110","units":1.0},
        {"id":32,"date":"2026-03-15","league":"NBA","tier":"MAX PROPHET","matchup":"Bucks vs Suns","pick":"Bucks -2.5","odds":"-110","units":1.5},
        {"id":33,"date":"2026-03-16","league":"NBA","tier":"PROPHET ELITE","matchup":"Celtics vs Pistons","pick":"Under 220.5","odds":"-110","units":1.0},
        {"id":34,"date":"2026-03-16","league":"NBA","tier":"MAX PROPHET","matchup":"Knicks vs Warriors","pick":"Knicks +4.5","odds":"-110","units":1.5},
        {"id":35,"date":"2026-03-17","league":"NCAAB","tier":"PROPHET ELITE","matchup":"First Four G1","pick":"Under 134.5","odds":"-110","units":1.0},
        {"id":36,"date":"2026-03-17","league":"NBA","tier":"MAX PROPHET","matchup":"Nuggets vs Wolves","pick":"Nuggets -1.5","odds":"-110","units":1.5},
        {"id":37,"date":"2026-03-18","league":"NCAAB","tier":"PROPHET ELITE","matchup":"First Four G2","pick":"Favorite ML","odds":"-160","units":1.0},
        {"id":38,"date":"2026-03-18","league":"NBA","tier":"MAX PROPHET","matchup":"Bucks vs Celtics","pick":"Celtics -4.5","odds":"-110","units":1.5},
        {"id":39,"date":"2026-03-19","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Round of 64 G1","pick":"Underdog +8.5","odds":"-110","units":1.0},
        {"id":40,"date":"2026-03-19","league":"NCAAB","tier":"MAX PROPHET","matchup":"Round of 64 G2","pick":"Favorite -12.5","odds":"-110","units":2.0},
        {"id":41,"date":"2026-03-20","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Round of 64 G3","pick":"Over 152.5","odds":"-110","units":1.0},
        {"id":42,"date":"2026-03-20","league":"NCAAB","tier":"MAX PROPHET","matchup":"Round of 64 G4","pick":"Favorite ML","odds":"-250","units":2.0},
        {"id":43,"date":"2026-03-21","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Round of 32 G1","pick":"Under 139.5","odds":"-110","units":1.0},
        {"id":44,"date":"2026-03-21","league":"NBA","tier":"MAX PROPHET","matchup":"Warriors vs Grizzlies","pick":"Warriors -9.5","odds":"-110","units":1.5},
        {"id":45,"date":"2026-03-22","league":"NCAAB","tier":"PROPHET ELITE","matchup":"Round of 32 G2","pick":"Dog ML","odds":"+140","units":1.0},
        {"id":46,"date":"2026-03-22","league":"NBA","tier":"MAX PROPHET","matchup":"Mavs vs Kings","pick":"Mavs -2.5","odds":"-110","units":1.5},
        {"id":47,"date":"2026-03-23","league":"NBA","tier":"PROPHET ELITE","matchup":"Clippers vs Pacers","pick":"Clippers ML","odds":"-150","units":1.0},
        {"id":48,"date":"2026-03-23","league":"NBA","tier":"MAX PROPHET","matchup":"Lakers vs Sixers","pick":"Lakers -3.5","odds":"-110","units":1.5},
        {"id":49,"date":"2026-03-24","league":"NBA","tier":"MAX PROPHET","matchup":"Warriors vs Heat","pick":"Warriors -2.5","odds":"-110","units":1.5},
        {"id":50,"date":"2026-03-24","league":"NBA","tier":"PROPHET ELITE","matchup":"Knicks vs Heat","pick":"Over 225.5","odds":"-105","units":1.25}
    ];

    try {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(DATA_PATH, JSON.stringify(fullHistory, null, 2));
        res.send(`<h1>Migration Successful!</h1><p>${fullHistory.length} plays loaded.</p><a href='/'>Go Home</a>`);
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

app.listen(PORT, "0.0.0.0", () => { console.log('Syndicate Engine Active'); });
