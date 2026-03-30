const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const PASSWORD = '7663';
const DATA_PATH = '/app/data/plays.json';
const PENDING_PATH = '/app/data/pending.json';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ODDS_API_KEY      = process.env.ODDS_API_KEY || '236431741a7870cbcbfdbc2540a45eea';

const ODDS_SPORT_KEYS = {
    NBA:   'basketball_nba',
    NCAAB: 'basketball_ncaab',
    MLB:   'baseball_mlb',
    NFL:   'americanfootball_nfl',
    NCAAF: 'americanfootball_ncaaf',
    NHL:   'icehockey_nhl',
};

// Player prop market keys supported by The Odds API
// Claude returns one of these in the prop_market field for prop picks
const PROP_MARKET_KEYS = {
    // ── NBA ──────────────────────────────────────────────────────
    player_points:                  'player_points',
    player_rebounds:                'player_rebounds',
    player_assists:                 'player_assists',
    player_steals:                  'player_steals',
    player_threes:                  'player_threes',
    player_blocks:                  'player_blocks',
    player_turnovers:               'player_turnovers',
    player_points_rebounds_assists: 'player_points_rebounds_assists',
    player_points_rebounds:         'player_points_rebounds',
    player_points_assists:          'player_points_assists',
    player_rebounds_assists:        'player_rebounds_assists',
    player_steals_blocks:           'player_steals_blocks',
    player_first_basket:            'player_first_basket',
    // ── NFL ──────────────────────────────────────────────────────
    player_pass_yds:                'player_pass_yds',
    player_pass_tds:                'player_pass_tds',
    player_rush_yds:                'player_rush_yds',
    player_reception_yds:           'player_reception_yds',
    player_receptions:              'player_receptions',
    player_anytime_td:              'player_anytime_td',
    // ── MLB ──────────────────────────────────────────────────────
    batter_hits:                    'batter_hits',
    batter_total_bases:             'batter_total_bases',
    batter_home_runs:               'batter_home_runs',
    batter_rbis:                    'batter_rbis',
    batter_runs_scored:             'batter_runs_scored',
    pitcher_strikeouts:             'pitcher_strikeouts',
    pitcher_hits_allowed:           'pitcher_hits_allowed',
    pitcher_walks:                  'pitcher_walks',
    pitcher_outs:                   'pitcher_outs',
};

// Fetch player prop odds for a specific event + market from Odds API
async function fetchPropOdds(eventId, sportKey, propMarket) {
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds` +
        `?apiKey=${ODDS_API_KEY}&regions=us&markets=${propMarket}&oddsFormat=american`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return null;
        return await res.json();
    } catch(e) { return null; }
}

// Find best Over or Under line for a specific player across all books
function findBestPropOdds(propData, playerName, side) {
    if (!propData || !propData.bookmakers) return null;
    const lastName = normTeam(playerName).split(' ').pop();
    let bestLine = null, bestOdds = null, bestBook = null;

    for (const book of propData.bookmakers) {
        const bLabel = book.title || book.key;
        for (const market of (book.markets || [])) {
            for (const outcome of (market.outcomes || [])) {
                // Player name is in outcome.description for props
                const desc = normTeam(outcome.description || outcome.name || '');
                if (!desc.includes(lastName)) continue;
                if (outcome.name !== side) continue;

                const point = outcome.point;
                const price = outcome.price;
                // Same logic as totals: Over → prefer lower line, Under → prefer higher line
                const better = bestLine === null ||
                    (side === 'Over'  && point < bestLine) ||
                    (side === 'Under' && point > bestLine) ||
                    (point === bestLine && price > bestOdds);
                if (better) { bestLine = point; bestOdds = price; bestBook = bLabel; }
            }
        }
    }

    if (bestOdds === null) return null;
    return {
        best_line: `${side} ${bestLine}`,
        best_odds: bestOdds > 0 ? `+${bestOdds}` : `${bestOdds}`,
        best_book: bestBook,
    };
}


app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

app.get('/api/plays', (req, res) => {
    if (fs.existsSync(DATA_PATH)) {
        try { res.json(JSON.parse(fs.readFileSync(DATA_PATH))); } catch (e) { res.json([]); }
    } else { res.json([]); }
});

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

// --- AI GRADER — looks up game result and grades the pick ---
app.post('/api/ai-grade', async (req, res) => {
    const { password, play } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    if (!ANTHROPIC_API_KEY) return res.status(500).send('API Key missing');

    const matchup = (play.away_team && play.home_team)
        ? `${play.away_team} @ ${play.home_team}`
        : (play.matchup || play.pick);

    const prompt = `Look up the final score of this game: ${matchup} on ${play.date} (${play.league || play.sport}).

The pick was: ${play.pick} at ${play.juice || play.odds || '-110'}.

Search the web for the final score. Then determine:
1. The final score
2. Whether the pick was a WIN, LOSS, or PUSH

Respond in this exact JSON format only, no markdown:
{
  "final_score": "Team A 112, Team B 108",
  "result": "WIN",
  "reasoning": "Miami +5.5 — Boston won 112-108, margin was 4 points so Miami covered"
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
                model: 'claude-sonnet-4-5',
                max_tokens: 500,
                tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = await aiResponse.json();
        if (!aiResponse.ok) return res.status(500).send(`Anthropic Error: ${data.error?.message}`);

        const textBlock = data.content.find(b => b.type === 'text');
        if (!textBlock) return res.status(500).send('No text response from AI');

        let raw = textBlock.text;
        let jsonStart = raw.indexOf('{');
        let jsonEnd = raw.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) return res.status(500).send(`Could not parse AI response: ${raw}`);

        const result = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
        res.status(200).json(result);
    } catch (err) {
        console.error('AI Grade error:', err);
        res.status(500).send(`Server error: ${err.message}`);
    }
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
                model: 'claude-sonnet-4-5',
                max_tokens: 300,
                system: systemPrompt,
                messages: [{ role: 'user', content: rawText }]
            })
        });

        const data = await aiResponse.json();

        if (!aiResponse.ok) {
            console.error("Anthropic Rejected the API Call:", data);
            return res.status(500).send(`Anthropic API Error: ${data.error?.message || 'Check Railway Logs'}`);
        }

        let rawContent = data.content[0].text;
        let jsonStart = rawContent.indexOf('{');
        let jsonEnd = rawContent.lastIndexOf('}');

        if (jsonStart === -1 || jsonEnd === -1) {
            return res.status(500).send(`Failed to find JSON in AI response. Raw output: ${rawContent}`);
        }

        let cleanContent = rawContent.substring(jsonStart, jsonEnd + 1);
        const extractedJson = JSON.parse(cleanContent);

        let pendingData = { pending_plays: [] };
        if (fs.existsSync(PENDING_PATH)) {
            pendingData = JSON.parse(fs.readFileSync(PENDING_PATH));
        }

        pendingData.pending_plays.push(extractedJson);
        fs.writeFileSync(PENDING_PATH, JSON.stringify(pendingData, null, 2));

        res.status(200).json(extractedJson);
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).send(`Server Crash: ${err.message}`);
    }
});

// --- PROPHET ENGINE RUN ---
// Two-pass approach:
//   Pass 1 (Claude): Extract picks from screenshots → score → select winners
//   Pass 2 (Odds API): For each winning pick, find best line + sportsbook
//   Pass 3 (Claude): Write final report using verified best odds

function normTeam(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchRawGames(sportKey) {
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/` +
        `?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch(e) { return []; }
}

function findBestOddsForPick(pick, rawGames) {
    if (!rawGames || rawGames.length === 0) return null;
    const parts = (pick.matchup || '').split('@').map(s => s.trim());
    const awaySearch = normTeam(parts[0] || '').split(' ').pop();
    const homeSearch = normTeam(parts[1] || '').split(' ').pop();

    // Fuzzy match game
    const game = rawGames.find(g =>
        normTeam(g.away_team).includes(awaySearch) &&
        normTeam(g.home_team).includes(homeSearch)
    ) || rawGames.find(g =>
        normTeam(g.home_team).includes(awaySearch) ||
        normTeam(g.away_team).includes(homeSearch)
    );
    if (!game) return null;

    const pickStr = (pick.pick || '').toLowerCase();
    const isOver  = /\bover\b/i.test(pickStr);
    const isUnder = /\bunder\b/i.test(pickStr);
    const isTotal = isOver || isUnder;
    const isML    = /\bml\b|\bmoneyline\b/i.test(pickStr) ||
                    (!isTotal && !/[+-]?\d+\.5/.test(pickStr));
    const side    = isOver ? 'Over' : isUnder ? 'Under' : null;

    let bestLine = null, bestOdds = null, bestBook = null;

    for (const book of (game.bookmakers || [])) {
        const bLabel = book.title || book.key;
        for (const market of (book.markets || [])) {
            for (const outcome of (market.outcomes || [])) {
                const price = outcome.price;
                const point = outcome.point;

                if (isTotal && market.key === 'totals' && outcome.name === side) {
                    // For OVER prefer lower line; for UNDER prefer higher line
                    const better = bestLine === null ||
                        (isOver  && point < bestLine) ||
                        (isUnder && point > bestLine) ||
                        (point === bestLine && price > bestOdds);
                    if (better) { bestLine = point; bestOdds = price; bestBook = bLabel; }

                } else if (isML && market.key === 'h2h') {
                    // Match pick team to outcome name
                    const pickTeamWord = normTeam(pickStr.replace(/\bml\b|\bmoneyline\b/gi, '')).split(' ').pop();
                    if (!normTeam(outcome.name).includes(pickTeamWord)) continue;
                    if (bestOdds === null || price > bestOdds) { bestOdds = price; bestBook = bLabel; }

                } else if (!isTotal && !isML && market.key === 'spreads') {
                    // Match pick team
                    const pickTeamWord = normTeam(pickStr).split(/[+-\s]/)[0].split(' ').pop();
                    if (!normTeam(outcome.name).includes(pickTeamWord)) continue;
                    // Favorite: prefer less negative (e.g. -3 over -4.5)
                    // Underdog:  prefer more positive (e.g. +7 over +5.5)
                    const isFav = point < 0;
                    const better = bestLine === null ||
                        (isFav  && point > bestLine) ||
                        (!isFav && point > bestLine) ||
                        (point === bestLine && price > bestOdds);
                    if (better) { bestLine = point; bestOdds = price; bestBook = bLabel; }
                }
            }
        }
    }

    if (bestOdds === null) return null;
    const oddsStr = bestOdds > 0 ? `+${bestOdds}` : `${bestOdds}`;
    if (isTotal) return { best_line: `${side} ${bestLine}`, best_odds: oddsStr, best_book: bestBook };
    if (isML)    return { best_line: pick.pick,              best_odds: oddsStr, best_book: bestBook };
    return       { best_line: `${bestLine > 0 ? '+' : ''}${bestLine}`, best_odds: oddsStr, best_book: bestBook };
}

app.post('/api/engine-run', async (req, res) => {
    const { password, rawPicks, date, images, mode } = req.body;
    const isProp = mode === 'prop';
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    if (!ANTHROPIC_API_KEY) return res.status(500).send('API Key missing');
    const hasImages = images && images.length > 0;
    const hasText   = rawPicks && rawPicks.trim().length > 5;
    if (!hasImages && !hasText) return res.status(400).send('Drop at least one screenshot or paste some picks.');

    const reportDate = date || new Date().toISOString().split('T')[0];
    const dayLabel = new Date(reportDate + 'T12:00:00')
        .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    // ── PASS 1: Extract + Score + Select ─────────────────────────────────────
    const selectionSystemPrompt = `You are The Prophet — a quantitative sports betting analyst API endpoint. Your ONLY output is a single valid JSON object. You never write prose, markdown, explanations, or any text outside the JSON braces. All analysis happens internally. Your response begins with { and ends with }.`;

    const selectionPrompt = `Date: ${dayLabel}
${hasImages ? `Input: ${images.length} sportsbook screenshot(s).` : `Input: Text picks.`}${hasText ? `\n\nAdditional notes:\n${rawPicks}` : ''}

INTERNAL ANALYSIS INSTRUCTIONS (do not narrate — do all of this silently, then output JSON):

1. EXTRACT every distinct pick from the screenshots/text. Count them for picks_analyzed. No duplicates.

2. VERIFY each pick via web_search: confirm the game is on today's slate, check injuries for both teams, check line movement since open. Search every pick — do not skip lower-ranked ones.

3. UEM SCORE each pick:
   implied_prob = negative odds: abs(odds)/(abs(odds)+100)×100 | positive odds: 100/(odds+100)×100
   edge_pct = your estimated true win% minus implied_prob
   sport_confidence: NBA=1.0 | NCAAB=1.0 | MLB=0.85 | NFL=0.95 | NHL=0.90
   line_movement_factor: moved your way=1.15 | neutral=1.0 | moved against=0.85
   UEM = (edge_pct/100) × sport_confidence × line_movement_factor × 10
   Skip any pick with odds worse than -125 or game unconfirmed.

4. RANK by UEM descending and assign tiers:
   ${isProp
     ? `Rank 1 → PROPHET ELITE | Rank 2 → MAX PROPHET | All others → CUT`
     : `Rank 1-2 → PROPHET ELITE | Rank 3-4 → MAX PROPHET | All others → CUT`}

5. For PLAYER PROP picks include player_name and prop_market from these Odds API keys:
   NBA: player_points | player_rebounds | player_assists | player_steals | player_threes | player_blocks | player_turnovers | player_points_rebounds_assists | player_points_rebounds | player_points_assists | player_rebounds_assists | player_steals_blocks | player_first_basket
   NFL: player_pass_yds | player_pass_tds | player_rush_yds | player_reception_yds | player_receptions | player_anytime_td
   MLB: batter_hits | batter_total_bases | batter_home_runs | batter_rbis | batter_runs_scored | pitcher_strikeouts | pitcher_hits_allowed | pitcher_walks | pitcher_outs
   For game-line picks (spread/total/ML) omit player_name and prop_market.

OUTPUT — respond with exactly this JSON structure and nothing else:
{
  "date": "${dayLabel}",
  "picks_analyzed": 0,
  "picks_selected": ${isProp ? 2 : 4},
  "all_picks": [
    {
      "rank": 1,
      "league": "NBA",
      "matchup": "Away Team @ Home Team",
      "pick": "LeBron James Over 25.5 Points",
      "odds": "-115",
      "uem_score": 3.85,
      "edge_pct": 22,
      "tier": "PROPHET ELITE",
      "units": "1.5u",
      "tipoff": "7:30 PM ET",
      "player_name": "LeBron James",
      "prop_market": "player_points",
      "verified_factors": ["factor 1", "factor 2"]
    }
  ]
}`;

    const msgContent = [];
    if (hasImages) images.forEach(img => msgContent.push({
        type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/png', data: img.base64 }
    }));
    msgContent.push({ type: 'text', text: selectionPrompt });

    // ── SSE setup — keeps Railway gateway alive during long Claude calls ──────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (type, payload) => {
        res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    };
    const status = (message) => send('status', { message });
    const done   = (result)  => { send('complete', result); res.end(); };
    const fail   = (message) => { send('error',  { message }); res.end(); };

    // Heartbeat every 20s so Railway doesn't close the connection
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    const cleanup   = () => clearInterval(heartbeat);

    try {
        // ── CALL 1: Selection ─────────────────────────────────────────────────
        status(`Analyzing ${hasImages ? images.length + ' screenshot(s)' : 'text picks'} — running web searches on every pick...`);

        const sel = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 8192,
                system: selectionSystemPrompt,
                tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 20 }],
                messages: [{ role: 'user', content: msgContent }]
            })
        });
        const selData = await sel.json();
        if (!sel.ok) { cleanup(); return fail(`Anthropic Error (selection): ${selData.error?.message}`); }
        const selText = selData.content.find(b => b.type === 'text');
        if (!selText) { cleanup(); return fail('No selection response from AI'); }

        let raw = selText.text;
        const jsonStart = raw.indexOf('{');
        const jsonEnd   = raw.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
            cleanup(); return fail(`Engine could not parse picks — response preview: ${raw.substring(0, 400)}`);
        }
        const selResult = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
        const allPicks  = selResult.all_picks || [];
        const selected  = allPicks.filter(p => p.tier !== 'CUT');
        status(`Scored ${selResult.picks_analyzed || allPicks.length} picks — ${selected.length} made the cut. Fetching best odds...`);

        // ── PASS 2: Odds API enrichment (selected picks only) ─────────────────
        const selectedPicks = selected;
        const sportsNeeded  = [...new Set(selectedPicks.map(p => p.league))];

        // Fetch raw game-line data for all sports needed (gives us event IDs too)
        const rawGamesCache = {};
        await Promise.all(sportsNeeded.map(async sport => {
            const key = ODDS_SPORT_KEYS[sport];
            if (key) rawGamesCache[sport] = await fetchRawGames(key);
        }));

        // Enrich all selected picks in parallel — props and game lines fire simultaneously
        await Promise.all(allPicks.map(async pick => {
            if (pick.tier === 'CUT') return;
            const games    = rawGamesCache[pick.league] || [];
            const sportKey = ODDS_SPORT_KEYS[pick.league];

            if (pick.player_name && pick.prop_market && PROP_MARKET_KEYS[pick.prop_market]) {
                // ── Player prop path ──────────────────────────────────────────
                const parts = (pick.matchup || '').split('@').map(s => s.trim());
                const awayW = normTeam(parts[0] || '').split(' ').pop();
                const homeW = normTeam(parts[1] || '').split(' ').pop();
                const game  = games.find(g =>
                    normTeam(g.away_team).includes(awayW) &&
                    normTeam(g.home_team).includes(homeW)
                );
                if (game && game.id && sportKey) {
                    const propData = await fetchPropOdds(game.id, sportKey, pick.prop_market);
                    const side = /under/i.test(pick.pick) ? 'Under' : 'Over';
                    const best = findBestPropOdds(propData, pick.player_name, side);
                    if (best) {
                        pick.best_line = best.best_line;
                        pick.best_odds = best.best_odds;
                        pick.best_book = best.best_book;
                    }
                }
            } else {
                // ── Game line path (spread / total / ML) ─────────────────────
                const best = findBestOddsForPick(pick, games);
                if (best) {
                    pick.best_line = best.best_line;
                    pick.best_odds = best.best_odds;
                    pick.best_book = best.best_book;
                }
            }
        }));

        // ── PASS 3: Report generation with verified best odds ─────────────────
        const picksForReport = allPicks.filter(p => p.tier !== 'CUT').map(p => {
            const oddsLine = p.best_odds && p.best_book
                ? `${p.best_line || p.pick} ${p.best_odds} (best available @ ${p.best_book})`
                : `${p.pick} ${p.odds} (odds from screenshot — verify before placing)`;
            return `Rank ${p.rank} | ${p.tier} | ${p.league} | ${p.matchup} | ${p.tipoff || 'TBD'}
PICK: ${oddsLine}
UEM: ${p.uem_score} | Edge: ${p.edge_pct}% | Units: ${p.units}
Notes: ${(p.verified_factors || []).join('; ')}`;
        }).join('\n\n');

        const reportPrompt = `You are The Prophet — Chief Quantitative Analyst for Prophetable. Protocol 6.0.

Write the final subscriber report for ${dayLabel} using the verified picks and odds below.
These odds have been confirmed via the Odds API — use them exactly as given.

VERIFIED PICKS WITH BEST AVAILABLE ODDS:
${picksForReport}

Generate one report block per pick using EXACTLY this template (no additions, no reordering):

PROPHET ELITE format:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[${dayLabel}] - ${isProp ? 'PROPHET ELITE PROP DROP' : 'PROPHET ELITE REPORT'}

[LEAGUE] | [Away Team] @ [Home Team]
🕒 Tip-off: [time]
✅ PICK: [pick] [best odds] @ [best book]
💰 RECOMMENDED PLAY: 1.5 Units 🌊 (BIG SPLASH)

📊 THE QUANTITATIVE METRICS
Projection: [modeled value]
Model Edge (UEM): [X.XX%]
Market Delta: [difference between projection and listed line]

The Math: The [odds] market price carries an implied probability of [X.X%]. The raw delta of [value] against the listed line normalizes to a [X.XX%] UEM.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MAX PROPHET format: identical but header says ${isProp ? 'MAX PROPHET PROP DROP' : 'MAX PROPHET REPORT'} and play line says 💰 RECOMMENDED PLAY: 1.0 Units 🔍 (STANDARD STRIKE)

ABSOLUTE RULES:
❌ NEVER write hit rates, historical records, DTM%, or fabricated stats
✅ Always show the sportsbook name on the PICK line (e.g. "Over 223.5 -110 @ FanDuel")
✅ If no best_book was found for a pick, note "(verify line before placing)"

${isProp
  ? `report_elite = single PROPHET ELITE block. report_max = single MAX PROPHET block.`
  : `report_elite = both PROPHET ELITE blocks separated by blank line. report_max = both MAX PROPHET blocks separated by blank line.`}

Respond ONLY in this JSON — no markdown:
{
  "report_elite": "...",
  "report_max": "..."
}`;

        status('Writing final report...');
        const rpt = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 4096,
                messages: [{ role: 'user', content: reportPrompt }]
            })
        });
        const rptData = await rpt.json();
        if (!rpt.ok) { cleanup(); return fail(`Anthropic Error (report): ${rptData.error?.message}`); }
        const rptText = rptData.content.find(b => b.type === 'text');
        if (!rptText) { cleanup(); return fail('No report response from AI'); }

        let rptRaw = rptText.text;
        const rptStart = rptRaw.indexOf('{');
        const rptEnd   = rptRaw.lastIndexOf('}');
        if (rptStart === -1 || rptEnd === -1) {
            cleanup(); return fail(`Report generation failed — response preview: ${rptRaw.substring(0, 400)}`);
        }
        const rptResult = JSON.parse(rptRaw.substring(rptStart, rptEnd + 1));

        cleanup();
        done({
            date:           selResult.date,
            picks_analyzed: selResult.picks_analyzed,
            picks_selected: selResult.picks_selected,
            all_picks:      allPicks,
            report_elite:   rptResult.report_elite || '',
            report_max:     rptResult.report_max   || '',
        });

    } catch (err) {
        cleanup();
        console.error('Engine Run error:', err);
        fail(`Server error: ${err.message}`);
    }
});

// --- QUEUE PICKS FROM PROPHET ENGINE ---
app.post('/api/queue-picks', (req, res) => {
    const { password, picks, date } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    if (!Array.isArray(picks) || picks.length === 0) return res.status(400).send('No picks provided');

    let pendingData = { pending_plays: [] };
    if (fs.existsSync(PENDING_PATH)) {
        try { pendingData = JSON.parse(fs.readFileSync(PENDING_PATH)); } catch(e) {}
    }

    picks.forEach(p => {
        // Split "Away @ Home" into parts
        const parts = (p.matchup || '').split('@').map(s => s.trim());
        const away_team = parts[0] || '';
        const home_team = parts[1] || '';
        const unitNum = parseFloat((p.units || '1.0').replace('u', ''));
        pendingData.pending_plays.push({
            date: date || new Date().toISOString().split('T')[0],
            league: p.league || 'NBA',
            tier: p.tier || 'PROPHET ELITE',
            away_team,
            home_team,
            matchup: p.matchup || '',
            pick: p.pick || '',
            juice: p.odds || '-110',
            unit_size: `${unitNum} Units`
        });
    });

    const dir = require('path').dirname(PENDING_PATH);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(PENDING_PATH, JSON.stringify(pendingData, null, 2));
    res.status(200).json({ queued: picks.length });
});

// --- ADMIN ROUTES ---
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
