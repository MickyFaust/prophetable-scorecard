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
        { id: 29, date: "202
