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
    // Verified true dataset from results_log.json
    const fullHistory = [
        { id: 1, date: "2026-03-05", tier: "PROPHET ELITE", league: "NCAAB", matchup: "South Florida Bulls @ Memphis Tigers", pick: "South Florida Bulls -6.5", odds: "-105", units: 0.0 },
        { id: 2, date: "2026-03-05", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Evansville Purple Aces @ Northern Iowa Panthers", pick: "Northern Iowa Panthers -15.0", odds: "-110", units: 0.0 },
        { id: 3, date: "2026-03-05", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Pepperdine Waves @ Portland Pilots", pick: "Pepperdine Waves +2.5", odds: "-105", units: 0.0 },
        { id: 4, date: "2026-03-05", tier: "MAX PROPHET", league: "NCAAB", matchup: "South Carolina St Bulldogs @ North Carolina Central Eagles", pick: "OVER 142.5", odds: "-108", units: 0.0 },
        { id: 5, date: "2026-03-05", tier: "MAX PROPHET", league: "NCAAB", matchup: "Howard Bison @ Norfolk St Spartans", pick: "OVER 148.5", odds: "-110", units: 0.0 },
        { id: 6, date: "2026-03-06", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Bowling Green Falcons @ Eastern Michigan Eagles", pick: "Eastern Michigan Eagles +5.5", odds: "-110", units: 0.0 },
        { id: 7, date: "2026-03-06", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Presbyterian Blue Hose @ Radford Highlanders", pick: "Presbyterian Blue Hose +2.5", odds: "-105", units: 0.0 },
        { id: 8, date: "2026-03-06", tier: "PROPHET ELITE", league: "NCAAB", matchup: "UNLV Rebels @ San Diego St Aztecs", pick: "UNLV Rebels +10.5", odds: "-102", units: 0.0 },
        { id: 9, date: "2026-03-06", tier: "MAX PROPHET", league: "NBA", matchup: "Dallas Mavericks @ Boston Celtics", pick: "UNDER 225.5", odds: "-105", units: 0.0 },
        { id: 10, date: "2026-03-06", tier: "MAX PROPHET", league: "NCAAB", matchup: "Fairfield Stags @ Saint Peter's Peacocks", pick: "UNDER 134.5", odds: "-110", units: 0.0 },
        { id: 11, date: "2026-03-07", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Arizona St Sun Devils @ Iowa State Cyclones", pick: "Arizona St Sun Devils +15.5", odds: "-105", units: -1.5 },
        { id: 12, date: "2026-03-07", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Sam Houston St Bearkats @ Liberty Flames", pick: "Sam Houston St Bearkats +4.5", odds: "-110", units: -1.5 },
        { id: 13, date: "2026-03-07", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Georgia Bulldogs @ Mississippi St Bulldogs", pick: "Georgia Bulldogs -5.5", odds: "-110", units: 1.36 },
        { id: 14, date: "2026-03-07", tier: "MAX PROPHET", league: "NBA", matchup: "Philadelphia 76ers @ Atlanta Hawks", pick: "UNDER 233.5", odds: "-110", units: -1.25 },
        { id: 15, date: "2026-03-07", tier: "MAX PROPHET", league: "NCAAB", matchup: "UConn Huskies @ Marquette Golden Eagles", pick: "UNDER 143.5", odds: "-105", units: 0.91 },
        { id: 16, date: "2026-03-08", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Western Carolina Catamounts @ East Tennessee St Buccaneers", pick: "Western Carolina Catamounts +3.5", odds: "-102", units: 1.36 },
        { id: 17, date: "2026-03-08", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Georgia Southern Eagles @ Marshall Thundering Herd", pick: "Georgia Southern Eagles +3.5", odds: "-110", units: 1.36 },
        { id: 18, date: "2026-03-08", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Penn State Nittany Lions @ Rutgers Scarlet Knights", pick: "Rutgers Scarlet Knights -5.5", odds: "-105", units: 1.14 },
        { id: 19, date: "2026-03-08", tier: "MAX PROPHET", league: "NBA", matchup: "Orlando Magic @ Milwaukee Bucks", pick: "UNDER 219.5", odds: "-110", units: -1.5 },
        { id: 20, date: "2026-03-08", tier: "MAX PROPHET", league: "NCAAB", matchup: "Colgate Raiders @ Lehigh Mountain Hawks", pick: "OVER 147.5", odds: "-110", units: -1.0 },
        { id: 21, date: "2026-03-08", tier: "PROPHET ELITE", league: "NBA", matchup: "Dallas Mavericks @ Toronto Raptors", pick: "Brandon Williams Reb OVER 2.5", odds: "-115", units: -2.0 },
        { id: 22, date: "2026-03-08", tier: "MAX PROPHET", league: "NBA", matchup: "Dallas Mavericks @ Toronto Raptors", pick: "Marvin Bagley III Pts OVER 8.5", odds: "-130", units: -2.0 },
        { id: 23, date: "2026-03-08", tier: "PROPHET ELITE", league: "NBA", matchup: "Charlotte Hornets @ Phoenix Suns", pick: "Grayson Allen Ast OVER 3.5", odds: "-145", units: 0.0 },
        { id: 24, date: "2026-03-08", tier: "MAX PROPHET", league: "NBA", matchup: "Charlotte Hornets @ Phoenix Suns", pick: "Moussa Diabate Ast OVER 1.5", odds: "-175", units: 0.86 },
        { id: 25, date: "2026-03-08", tier: "PROPHET ELITE", league: "NBA", matchup: "Charlotte Hornets @ Phoenix Suns", pick: "Collin Gillespie Ast OVER 4.5", odds: "-120", units: -1.25 },
        { id: 26, date: "2026-03-08", tier: "MAX PROPHET", league: "NBA", matchup: "Charlotte Hornets @ Phoenix Suns", pick: "Oso Ighodaro Pts+Ast OVER 10.5", odds: "-110", units: -1.0 },
        { id: 27, date: "2026-03-08", tier: "PROPHET ELITE", league: "NBA", matchup: "Charlotte Hornets @ Phoenix Suns", pick: "Collin Gillespie Ast OVER 4.5", odds: "-120", units: -1.25 },
        { id: 28, date: "2026-03-08", tier: "MAX PROPHET", league: "NBA", matchup: "Charlotte Hornets @ Phoenix Suns", pick: "Oso Ighodaro Pts+Ast OVER 10.5", odds: "-120", units: -1.0 },
        { id: 29, date: "2026-03-09", tier: "PROPHET ELITE", league: "NBA", matchup: "Philadelphia 76ers @ Cleveland Cavaliers", pick: "UNDER 227.5", odds: "-108", units: 1.14 },
        { id: 30, date: "2026-03-09", tier: "PROPHET ELITE", league: "NBA", matchup: "Golden State Warriors @ Utah Jazz", pick: "UNDER 227.5", odds: "-105", units: -1.25 },
        { id: 31, date: "2026-03-09", tier: "MAX PROPHET", league: "NCAAB", matchup: "Nicholls St Colonels @ UT Rio Grande Valley Vaqueros", pick: "UNDER 146.0", odds: "-110", units: -1.0 },
        { id: 32, date: "2026-03-09", tier: "MAX PROPHET", league: "NCAAB", matchup: "Nicholls St Colonels @ UT Rio Grande Valley Vaqueros", pick: "Nicholls St Colonels +8.5", odds: "-105", units: -1.0 },
        { id: 33, date: "2026-03-09", tier: "PROPHET ELITE", league: "NBA", matchup: "Denver Nuggets @ Oklahoma City Thunder", pick: "Aaron Gordon Pts UNDER 12.5", odds: "-105", units: -1.5 },
        { id: 34, date: "2026-03-09", tier: "MAX PROPHET", league: "NBA", matchup: "Philadelphia 76ers @ Cleveland Cavaliers", pick: "Jabari Walker Pts OVER 9.5", odds: "-118", units: -1.5 },
        { id: 35, date: "2026-03-09", tier: "PROPHET ELITE", league: "NBA", matchup: "New York Knicks @ Los Angeles Clippers", pick: "Kris Dunn Reb OVER 3.5", odds: "+117", units: 2.05 },
        { id: 36, date: "2026-03-09", tier: "MAX PROPHET", league: "NBA", matchup: "Golden State Warriors @ Utah Jazz", pick: "De'Anthony Melton Pts+Ast UNDER 21.5", odds: "-105", units: -1.75 },
        { id: 37, date: "2026-03-10", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Idaho Vandals @ Eastern Washington Eagles", pick: "Idaho Vandals -1.5", odds: "-110", units: 1.36 },
        { id: 38, date: "2026-03-10", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Penn State Nittany Lions @ Northwestern Wildcats", pick: "Northwestern Wildcats -5.5", odds: "-102", units: 1.14 },
        { id: 39, date: "2026-03-10", tier: "MAX PROPHET", league: "NCAAB", matchup: "New Mexico St Aggies @ Jacksonville St Gamecocks", pick: "Jacksonville St Gamecocks +1.5", odds: "-110", units: -1.25 },
        { id: 40, date: "2026-03-10", tier: "MAX PROPHET", league: "NBA", matchup: "Minnesota Timberwolves @ Los Angeles Lakers", pick: "UNDER 230.5", odds: "-110", units: 1.36 },
        { id: 41, date: "2026-03-10", tier: "PROPHET ELITE", league: "NBA", matchup: "Toronto Raptors @ Houston Rockets", pick: "Dorian Finney-Smith Reb OVER 2.5", odds: "-123", units: 1.42 },
        { id: 42, date: "2026-03-10", tier: "MAX PROPHET", league: "NBA", matchup: "Dallas Mavericks @ Atlanta Hawks", pick: "Daniel Gafford Pts+Reb OVER 15.5", odds: "-118", units: 1.48 },
        { id: 43, date: "2026-03-10", tier: "PROPHET ELITE", league: "NBA", matchup: "Dallas Mavericks @ Atlanta Hawks", pick: "Daniel Gafford Pts+Reb OVER 15.5", odds: "-105", units: 1.67 },
        { id: 44, date: "2026-03-10", tier: "MAX PROPHET", league: "NBA", matchup: "Dallas Mavericks @ Atlanta Hawks", pick: "Naji Marshall Pts+Reb UNDER 19.5", odds: "-105", units: 1.67 },
        { id: 45, date: "2026-03-12", tier: "PROPHET ELITE", league: "NCAAB", matchup: "UNLV Rebels @ Utah State Aggies", pick: "UNLV Rebels +7.5", odds: "-108", units: 0.0 },
        { id: 46, date: "2026-03-12", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Buffalo Bulls @ Akron Zips", pick: "Akron Zips -13.5", odds: "-110", units: 0.0 },
        { id: 47, date: "2026-03-12", tier: "PROPHET ELITE", league: "NBA", matchup: "Washington Wizards @ Orlando Magic", pick: "Alex Sarr Pts OVER 11.5", odds: "-110", units: 0.0 },
        { id: 48, date: "2026-03-12", tier: "MAX PROPHET", league: "NCAAB", matchup: "Northwestern Wildcats @ Purdue Boilermakers", pick: "Northwestern Wildcats +12.5", odds: "-110", units: 0.0 },
        { id: 49, date: "2026-03-12", tier: "MAX PROPHET", league: "NBA", matchup: "Chicago Bulls @ Los Angeles Lakers", pick: "UNDER 238.5", odds: "-122", units: 0.0 },
        { id: 50, date: "2026-03-13", tier: "PROPHET ELITE", league: "NBA", matchup: "Memphis Grizzlies @ Detroit Pistons", pick: "Cedric Coward Reb OVER 5.5", odds: "-104", units: -2.0 },
        { id: 51, date: "2026-03-13", tier: "PROPHET ELITE", league: "NBA", matchup: "New Orleans Pelicans @ Houston Rockets", pick: "Tari Eason Pts UNDER 13.5", odds: "-115", units: 1.74 },
        { id: 52, date: "2026-03-13", tier: "MAX PROPHET", league: "NBA", matchup: "New Orleans Pelicans @ Houston Rockets", pick: "Tari Eason Pts+Ast UNDER 14.5", odds: "-115", units: 1.74 },
        { id: 53, date: "2026-03-13", tier: "MAX PROPHET", league: "NBA", matchup: "Minnesota Timberwolves @ Golden State Warriors", pick: "De'Anthony Melton Pts+Reb OVER 19.5", odds: "-110", units: -1.75 },
        { id: 54, date: "2026-03-13", tier: "MAX PROPHET", league: "NBA", matchup: "New York Knicks @ Indiana Pacers", pick: "Mikal Bridges Pts UNDER 14.5", odds: "-120", units: 1.46 },
        { id: 55, date: "2026-03-13", tier: "MAX PROPHET", league: "NBA", matchup: "Cleveland Cavaliers @ Dallas Mavericks", pick: "Klay Thompson Pts OVER 11.5", odds: "-115", units: -1.75 },
        { id: 56, date: "2026-03-13", tier: "PROPHET ELITE", league: "NBA", matchup: "New York Knicks @ Indiana Pacers", pick: "Mikal Bridges Pts UNDER 14.5", odds: "-120", units: 1.46 },
        { id: 57, date: "2026-03-13", tier: "PROPHET ELITE", league: "NBA", matchup: "Minnesota Timberwolves @ Golden State Warriors", pick: "De'Anthony Melton Pts+Reb OVER 19.5", odds: "-110", units: -1.75 },
        { id: 58, date: "2026-03-13", tier: "MAX PROPHET", league: "NBA", matchup: "Chicago Bulls @ Los Angeles Clippers", pick: "Kris Dunn Pts UNDER 7.5", odds: "-118", units: -1.75 },
        { id: 59, date: "2026-03-13", tier: "MAX PROPHET", league: "NCAAB", matchup: "Ohio State Buckeyes @ Michigan Wolverines", pick: "Ohio State Buckeyes @ Michigan Wolverines UNDER 155.5", odds: "-110", units: 0.0 },
        { id: 60, date: "2026-03-13", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Wisconsin Badgers @ Illinois Fighting Illini", pick: "Wisconsin Badgers +7.5", odds: "-112", units: 0.0 },
        { id: 61, date: "2026-03-14", tier: "PROPHET ELITE", league: "NBA", matchup: "Milwaukee Bucks @ Atlanta Hawks", pick: "Kevin Porter Jr. Pts UNDER 13.5", odds: "-110", units: -2.0 },
        { id: 62, date: "2026-03-14", tier: "PROPHET ELITE", league: "NBA", matchup: "Milwaukee Bucks @ Atlanta Hawks", pick: "Kevin Porter Jr. Reb OVER 4.5", odds: "-105", units: 1.9 },
        { id: 63, date: "2026-03-14", tier: "MAX PROPHET", league: "NBA", matchup: "Washington Wizards @ Boston Celtics", pick: "Tre Johnson Pts+Ast OVER 12.5", odds: "-110", units: -2.0 },
        { id: 64, date: "2026-03-14", tier: "MAX PROPHET", league: "NBA", matchup: "Milwaukee Bucks @ Atlanta Hawks", pick: "Kyle Kuzma Pts+Reb OVER 13.5", odds: "-125", units: 1.6 },
        { id: 65, date: "2026-03-15", tier: "PROPHET ELITE", league: "NBA", matchup: "Dallas Mavericks @ Cleveland Cavaliers", pick: "Khris Middleton Pts+Ast OVER 11.5", odds: "-122", units: -1.5 },
        { id: 66, date: "2026-03-15", tier: "PROPHET ELITE", league: "NBA", matchup: "Dallas Mavericks @ Cleveland Cavaliers", pick: "Marvin Bagley III Pts UNDER 10.5", odds: "-120", units: 1.25 },
        { id: 67, date: "2026-03-15", tier: "MAX PROPHET", league: "NBA", matchup: "Minnesota Timberwolves @ Oklahoma City Thunder", pick: "Luguentz Dort Reb OVER 3.5", odds: "-111", units: -1.5 },
        { id: 68, date: "2026-03-15", tier: "MAX PROPHET", league: "NBA", matchup: "Indiana Pacers @ Milwaukee Bucks", pick: "Ousmane Dieng Pts UNDER 10.5", odds: "-120", units: 0.0 },
        { id: 69, date: "2026-03-15", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Penn @ Yale", pick: "Yale -9.5", odds: "-110", units: 0.0 },
        { id: 70, date: "2026-03-15", tier: "MAX PROPHET", league: "NCAAB", matchup: "Purdue Boilermakers @ Michigan Wolverines", pick: "Michigan -6.5", odds: "-116", units: 0.0 },
        { id: 71, date: "2026-03-15", tier: "MAX PROPHET", league: "NBA", matchup: "Golden State Warriors @ New York Knicks", pick: "Will Richard Reb OVER 3.5", odds: "-101", units: -1.5 },
        { id: 72, date: "2026-03-15", tier: "PROPHET ELITE", league: "NBA", matchup: "Golden State Warriors @ New York Knicks", pick: "Mitchell Robinson Pts OVER 4.5", odds: "-115", units: -2.0 },
        { id: 73, date: "2026-03-15", tier: "PROPHET ELITE", league: "NBA", matchup: "Dallas Mavericks @ Cleveland Cavaliers", pick: "Khris Middleton Pts OVER 9.5", odds: "-110", units: -1.75 },
        { id: 74, date: "2026-03-16", tier: "PROPHET ELITE", league: "NBA", matchup: "Golden State Warriors @ Washington Wizards", pick: "OVER 232.5", odds: "-105", units: 1.14 },
        { id: 75, date: "2026-03-16", tier: "PROPHET ELITE", league: "NBA", matchup: "Portland Trail Blazers @ Brooklyn Nets", pick: "UNDER 220.5", odds: "-108", units: 0.91 },
        { id: 76, date: "2026-03-16", tier: "MAX PROPHET", league: "NBA", matchup: "Memphis Grizzlies @ Chicago Bulls", pick: "OVER 242.5", odds: "-110", units: -1.0 },
        { id: 77, date: "2026-03-16", tier: "PROPHET ELITE", league: "NBA", matchup: "Los Angeles Lakers @ Houston Rockets", pick: "Deandre Ayton Pts OVER 9.5", odds: "-120", units: -1.75 },
        { id: 78, date: "2026-03-16", tier: "MAX PROPHET", league: "NBA", matchup: "Los Angeles Lakers @ Houston Rockets", pick: "Deandre Ayton Pts+Reb OVER 16.5", odds: "-105", units: 1.67 },
        { id: 79, date: "2026-03-16", tier: "MAX PROPHET", league: "NBA", matchup: "Los Angeles Lakers @ Houston Rockets", pick: "Tari Eason Pts UNDER 10.5", odds: "-115", units: 1.3 },
        { id: 80, date: "2026-03-17", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Liberty Flames @ George Mason Patriots", pick: "George Mason Patriots -5.5", odds: "-105", units: -1.5 },
        { id: 81, date: "2026-03-17", tier: "PROPHET ELITE", league: "NCAAB", matchup: "UMBC Retrievers @ Howard Bison", pick: "UMBC Retrievers -1.0", odds: "-110", units: -1.0 },
        { id: 82, date: "2026-03-19", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Texas Longhorns @ BYU Cougars", pick: "BYU Cougars -2.5", odds: "-106", units: -1.5 },
        { id: 83, date: "2026-03-19", tier: "PROPHET ELITE", league: "NCAAB", matchup: "Siena Saints @ Duke Blue Devils", pick: "Siena Saints +28.5", odds: "-109", units: 1.36 },
        { id: 84, date: "2026-03-19", tier: "MAX PROPHET", league: "NBA", matchup: "Detroit Pistons @ Washington Wizards", pick: "OVER 231.5", odds: "-105", units: -1.5 },
        { id: 85, date: "2026-03-19", tier: "MAX PROPHET", league: "NBA", matchup: "Phoenix Suns @ San Antonio Spurs", pick: "OVER 227.5", odds: "-105", units: -1.25 },
        { id: 86, date: "2026-03-19", tier: "PROPHET ELITE", league: "NBA", matchup: "Milwaukee Bucks @ Utah Jazz", pick: "Ace Bailey 3PM OVER 2.5", odds: "+105", units: 2.1 },
        { id: 87, date: "2026-03-19", tier: "PROPHET ELITE", league: "NBA", matchup: "Los Angeles Lakers @ Miami Heat", pick: "Tyler Herro Reb OVER 4.5", odds: "-115", units: 1.52 },
        { id: 88, date: "2026-03-19", tier: "MAX PROPHET", league: "NBA", matchup: "Detroit Pistons @ Washington Wizards", pick: "Ausar Thompson Pts UNDER 11.5", odds: "-105", units: 1.67 },
        { id: 89, date: "2026-03-19", tier: "PROPHET ELITE", league: "NBA", matchup: "Orlando Magic @ Charlotte Hornets", pick: "Jalen Suggs Reb OVER 3.5", odds: "-120", units: -1.5 },
        { id: 90, date: "2026-03-19", tier: "MAX PROPHET", league: "NBA", matchup: "Phoenix Suns @ San Antonio Spurs", pick: "Collin Gillespie Pts UNDER 11.5", odds: "-115", units: -1.5 },
        { id: 91, date: "2026-03-19", tier: "MAX PROPHET", league: "NBA", matchup: "Cleveland Cavaliers @ Chicago Bulls", pick: "Keon Ellis Pts OVER 8.5", odds: "-120", units: -1.5 },
        { id: 92, date: "2026-03-19", tier: "PROPHET ELITE", league: "NBA", matchup: "Milwaukee Bucks @ Utah Jazz", pick: "Ace Bailey 3PM OVER 2.5", odds: "+105", units: 2.1 },
        { id: 93, date: "2026-03-19", tier: "PROPHET ELITE", league: "NBA", matchup: "Milwaukee Bucks @ Utah Jazz", pick: "Bobby Portis 3PM OVER 2.5", odds: "+145", units: -1.5 },
        { id: 94, date: "2026-03-19", tier: "MAX PROPHET", league: "NBA", matchup: "Cleveland Cavaliers @ Chicago Bulls", pick: "Jalen Smith Reb UNDER 7.5", odds: "-105", units: 0.0 },
        { id: 95, date: "2026-03-19", tier: "MAX PROPHET", league: "NBA", matchup: "Philadelphia 76ers @ Sacramento Kings", pick: "Russell Westbrook Pts UNDER 17.5", odds: "-105", units: 1.19 }
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
