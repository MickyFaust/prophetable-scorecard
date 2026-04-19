const express = require('express');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const app     = express();

// Firebase Admin — initialised lazily so missing credentials don't crash startup
let _fbAdmin = null;
function getFirebaseAdmin() {
    if (_fbAdmin) return _fbAdmin;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    try {
        const admin      = require('firebase-admin');
        const credential = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        if (!admin.apps.length) {
            admin.initializeApp({ credential: admin.credential.cert(credential) });
        }
        _fbAdmin = admin;
        return admin;
    } catch (e) {
        console.error('[FIREBASE ADMIN] Init failed:', e.message);
        return null;
    }
}

const PORT = process.env.PORT || 3000;
const PASSWORD = '7663';
const DATA_PATH = '/app/data/plays.json';
const PENDING_PATH = '/app/data/pending.json';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ODDS_API_KEY      = process.env.ODDS_API_KEY || '236431741a7870cbcbfdbc2540a45eea';
const CONSOLE_URL       = process.env.CONSOLE_URL  || 'https://prophetable-production.up.railway.app';

// Approved sportsbooks — only these appear in reports
const APPROVED_BOOKS = new Set([
    'draftkings', 'fanduel', 'betmgm', 'caesars', 'espnbet',
    'pointsbet', 'bet365', 'barstool', 'wynnbet', 'betrivers',
    'unibet', 'superbook', 'hardrock', 'fanatics', 'fliff'
]);

function isApprovedBook(bookKey) {
    return APPROVED_BOOKS.has((bookKey || '').toLowerCase().replace(/[\s.]/g, ''));
}

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
        if (!isApprovedBook(book.key) && !isApprovedBook(book.title)) continue;
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
        if (!isApprovedBook(book.key) && !isApprovedBook(book.title)) continue;
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
                    // Strip ml/moneyline AND odds numbers before extracting team word
                    const pickTeamWord = normTeam(pickStr
                        .replace(/\bml\b|\bmoneyline\b/gi, '')
                        .replace(/[+-]?\d{2,}/g, ''))
                        .split(' ').filter(w => w.length > 1).pop();
                    if (!pickTeamWord || !normTeam(outcome.name).includes(pickTeamWord)) continue;
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

// ── Juice cap server-side enforcement ────────────────────────────────────────
function parseOddsNum(oddsStr) {
    const n = parseInt((oddsStr || '').toString().replace(/[^-\d]/g, ''));
    return isNaN(n) ? 0 : n;
}
function applyJuiceCap(picks, cap = -125) {
    return picks.map(pick => {
        if (pick.cut_reason) return pick; // already juice-capped — skip
        const odds = parseOddsNum(pick.odds);
        if (odds < cap) { // e.g. -156 < -125 → too juicy
            return { ...pick, tier: 'CUT', cut_reason: `Juice cap: ${pick.odds}` };
        }
        return pick;
    });
}

app.post('/api/engine-run', async (req, res) => {
    const { password, rawPicks, date, images, mode, lockedPicks, replaceCount, picksOverride } = req.body;
    const isProp       = mode === 'prop';
    const isOverride   = Array.isArray(picksOverride) && picksOverride.length > 0;
    const isReplace    = !isOverride && Array.isArray(lockedPicks) && lockedPicks.length > 0;
    const slotsNeeded  = isReplace ? (replaceCount || 1) : (isProp ? 2 : 4);
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

    const lockedSection = isReplace ? `
LOCKED PICKS (already confirmed — do NOT include these in your new picks, they are staying in the report):
${lockedPicks.map((p, i) => `${i+1}. ${p.pick} — ${p.matchup} (${p.odds || ''})`).join('\n')}

Find exactly ${slotsNeeded} replacement pick(s) from the remaining picks in the screenshots. Do not re-select any locked pick above.
` : '';

    const selectionPrompt = `Date: ${dayLabel}
${hasImages ? `Input: ${images.length} sportsbook screenshot(s).` : `Input: Text picks.`}${hasText ? `\n\nAdditional notes:\n${rawPicks}` : ''}
${lockedSection}
INTERNAL ANALYSIS INSTRUCTIONS (do not narrate — do all of this silently, then output JSON):

1. EXTRACT every distinct pick from the screenshots/text. Count them for picks_analyzed. No duplicates.

2. VERIFY each pick via web_search: confirm the game is on today's slate, check injuries for both teams, check line movement since open. Search every pick — do not skip lower-ranked ones.

3. UEM SCORE each pick:
   implied_prob = negative odds: abs(odds)/(abs(odds)+100)×100 | positive odds: 100/(odds+100)×100
   edge_pct = your estimated true win% minus implied_prob
   sport_confidence: NBA=1.0 | NCAAB=1.0 | MLB=0.85 | NFL=0.95 | NHL=0.90
   line_movement_factor: moved your way=1.15 | neutral=1.0 | moved against=0.85
   bet_type_factor: Spread=1.0 | Total=1.0 | Moneyline=0.9 | Player Prop=0.75
   UEM = (edge_pct/100) × sport_confidence × line_movement_factor × bet_type_factor × 10
   Skip any pick with odds worse than -125 or game unconfirmed.

4. RANK by UEM descending and assign tiers:
   ${isProp
     ? `Rank 1 → PROPHET ELITE | Rank 2 → MAX PROPHET | All others → CUT`
     : `Rank 1-${slotsNeeded <= 2 ? slotsNeeded : 2} → PROPHET ELITE | Rank ${slotsNeeded <= 2 ? slotsNeeded+1 : 3}-${slotsNeeded} → MAX PROPHET | All others → CUT`}
   CRITICAL: Include EVERY analyzed pick in all_picks — not just the top ${slotsNeeded}. Ranks ${slotsNeeded + 1}+ get tier: "CUT". This is required for the backup pool.

   Set units based on UEM score (use exact values):
   UEM ≥ 4.0 → "2.0u"  | UEM 3.0–3.99 → "1.75u" | UEM 2.0–2.99 → "1.5u"
   UEM 1.5–1.99 → "1.25u" | UEM < 1.5 → "1.0u"

5. For PLAYER PROP picks include player_name and prop_market from these Odds API keys:
   NBA: player_points | player_rebounds | player_assists | player_steals | player_threes | player_blocks | player_turnovers | player_points_rebounds_assists | player_points_rebounds | player_points_assists | player_rebounds_assists | player_steals_blocks | player_first_basket
   NFL: player_pass_yds | player_pass_tds | player_rush_yds | player_reception_yds | player_receptions | player_anytime_td
   MLB: batter_hits | batter_total_bases | batter_home_runs | batter_rbis | batter_runs_scored | pitcher_strikeouts | pitcher_hits_allowed | pitcher_walks | pitcher_outs
   For game-line picks (spread/total/ML) omit player_name and prop_market.

OUTPUT — respond with exactly this JSON structure and nothing else:
{
  "date": "${dayLabel}",
  "picks_analyzed": 0,
  "picks_selected": ${slotsNeeded},
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
        let allPicks     = [];
        let picksAnalyzed = 0;

        if (isOverride) {
            // ── REPLACE PATH: picks already selected by client — skip Claude Pass 1 ──
            status('Picks locked — fetching best odds for promoted picks...');
            allPicks      = picksOverride;
            picksAnalyzed = picksOverride.length;
        } else {
            // ── CALL 1: Selection ──────────────────────────────────────────────────
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
            // Use LAST text block — Claude emits intermediate reasoning texts during web_search
            // before the final JSON response. find() grabs the first one (wrong).
            const selText = [...(selData.content || [])].reverse().find(b => b.type === 'text');
            if (!selText) { cleanup(); return fail('No selection response from AI'); }

            let raw = selText.text;
            const jsonStart = raw.indexOf('{');
            const jsonEnd   = raw.lastIndexOf('}');
            if (jsonStart === -1 || jsonEnd === -1) {
                cleanup(); return fail(`Engine could not parse picks — response preview: ${raw.substring(0, 400)}`);
            }
            const selResult = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
            allPicks      = selResult.all_picks || [];
            picksAnalyzed = selResult.picks_analyzed || allPicks.length;

            // ── Auto-backfill: juice cap runs AFTER Odds API enrichment — not here ──
            const target = isProp ? 2 : 4;
            const afterCap = allPicks.filter(p => p.tier !== 'CUT');
            if (afterCap.length < target) {
                const deficit  = target - afterCap.length;
                // Eligible = CUT picks that were NOT cut by juice cap (no cut_reason = Claude ranked them)
                const eligible = allPicks
                    .filter(p => p.tier === 'CUT' && !p.cut_reason)
                    .sort((a, b) => (b.uem_score || 0) - (a.uem_score || 0));
                for (let i = 0; i < Math.min(deficit, eligible.length); i++) {
                    eligible[i].tier = 'PROMOTED'; // temp flag
                }
            }
            // Re-rank all non-CUT picks by UEM and assign final tiers
            const finalSelected = allPicks
                .filter(p => p.tier !== 'CUT')
                .sort((a, b) => (b.uem_score || 0) - (a.uem_score || 0));
            finalSelected.forEach((p, i) => {
                p.tier = i < 2 ? 'PROPHET ELITE' : 'MAX PROPHET';
                p.rank = i + 1;
            });
        }

        const selected  = allPicks.filter(p => p.tier !== 'CUT');
        status(`${isOverride ? 'Replaced' : 'Scored'} ${picksAnalyzed} picks — ${selected.length} in report. Fetching best odds...`);

        // ── PASS 2: Odds API enrichment — all non-CUT picks, juice cap fires after ──
        const sportsNeeded = [...new Set(allPicks.filter(p => p.tier !== 'CUT').map(p => p.league))];

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

        // ── JUICE CAP — after Odds API found best available line ──────────────
        allPicks = allPicks.map(pick => {
            if (pick.tier === 'CUT') return pick;
            const effectiveOdds = pick.best_odds ? parseOddsNum(pick.best_odds) : extractOdds(pick).val;
            if (effectiveOdds !== 0 && effectiveOdds < -125) {
                return { ...pick, tier: 'CUT', cut_reason: `Juice cap: ${pick.best_odds || pick.odds}` };
            }
            return pick;
        });

        // ── PASS 3: Report generation with verified best odds ─────────────────
        const elitePicks = allPicks.filter(p => p.tier === 'PROPHET ELITE');
        const maxPicks   = allPicks.filter(p => p.tier === 'MAX PROPHET');

        function formatPickBlock(p) {
            const oddsLine = p.best_odds && p.best_book
                ? `${p.best_line || p.pick} ${p.best_odds} @ ${p.best_book}`
                : `${p.pick} ${p.odds} (verify line before placing)`;
            return `${p.league} | ${p.matchup} | ${p.tipoff || 'TBD'}
PICK: ${oddsLine}
UEM: ${p.uem_score} | Edge: ${p.edge_pct}% | Units: ${p.units || '1.0u'}
Notes: ${(p.verified_factors || []).join('; ')}`;
        }

        const eliteSection = elitePicks.length > 0
            ? `PROPHET ELITE PICKS (go in report_elite ONLY):\n${elitePicks.map(formatPickBlock).join('\n\n')}`
            : `PROPHET ELITE PICKS: NONE — set report_elite to ""`;
        const maxSection = maxPicks.length > 0
            ? `MAX PROPHET PICKS (go in report_max ONLY):\n${maxPicks.map(formatPickBlock).join('\n\n')}`
            : `MAX PROPHET PICKS: NONE — set report_max to ""`;

        const reportPrompt = `You are The Prophet — Chief Quantitative Analyst for Prophetable. Protocol 6.0.

Write the final subscriber report for ${dayLabel}. Each pick goes in ONE section only — never duplicate a pick across sections.

${eliteSection}

${maxSection}

REPORT BLOCK TEMPLATE (one block per pick, use this format exactly):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[${dayLabel}] - [PROPHET ELITE REPORT or MAX PROPHET REPORT]

[LEAGUE] | [Away] @ [Home]
🕒 Tip-off: [time]
✅ PICK: [pick line] [odds] @ [book]
💰 RECOMMENDED PLAY: [units from pick data] ([unit name])

📊 THE QUANTITATIVE METRICS
Projection: [modeled value]
Model Edge (UEM): [X.XX%]
Market Delta: [difference]

The Math: The [odds] market price carries an implied probability of [X%]. The raw delta of [value] against the listed line normalizes to a [X.XX%] UEM.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UNIT SCALE (use the units field from pick data to select):
2.0u → 🐋 WHALE | 1.75u → 🦈 SHARK | 1.5u → 🌊 BIG SPLASH | 1.25u → 💧 BUMP | 1.0u → 🔍 STANDARD STRIKE

ABSOLUTE RULES:
❌ NEVER put the same pick in both report_elite and report_max
❌ NEVER write hit rates, historical records, DTM%, or fabricated stats
✅ Always show the sportsbook name on the PICK line
✅ If no book found, write "(verify line before placing)"
✅ If a section has no picks, its value must be ""

${isProp
  ? `report_elite = PROPHET ELITE PROP DROP block(s). report_max = MAX PROPHET PROP DROP block(s).`
  : `report_elite = all PROPHET ELITE blocks. report_max = all MAX PROPHET blocks.`}

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
            date:           dayLabel,
            picks_analyzed: picksAnalyzed,
            picks_selected: selected.length,
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

// --- THE SPIN — proxy to Prophet Engine ---
app.post('/api/spin-run', async (req, res) => {
    const { password, includeElite = true, includeMax = true } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send      = (type, payload) => res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    const cleanup   = () => clearInterval(heartbeat);

    try {
        send('status', { message: '🌀 The Spin is loading caches and fetching today\'s MLB schedule...' });

        const spinRes = await fetch(`${CONSOLE_URL}/api/spin`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                password:      process.env.CONSOLE_PASSWORD || PASSWORD,
                include_elite: includeElite,
                include_max:   includeMax,
            }),
            signal: AbortSignal.timeout(200000),
        });

        const ct = spinRes.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
            const raw = await spinRes.text();
            throw new Error(`Engine HTTP ${spinRes.status} — non-JSON response: ${raw.substring(0, 300)}`);
        }
        const data = await spinRes.json();
        cleanup();

        if (data.debug) console.log('[Spin debug]\n' + data.debug);

        if (!spinRes.ok || data.error) {
            send('error', { message: data.error || 'Spin engine error — check Railway logs' });
            return res.end();
        }

        if (!data.success) {
            send('spin_complete', { success: false, message: data.error || 'No qualifying picks today' });
            return res.end();
        }

        send('spin_complete', {
            success:    true,
            picks:      data.picks      || [],
            elite_text: data.elite_text || '',
            max_text:   data.max_text   || '',
        });
        res.end();

    } catch (err) {
        cleanup();
        send('error', { message: err.message });
        res.end();
    }
});

// --- EDIT PENDING PICK ---
app.put('/admin/edit-pending/:index', (req, res) => {
    const { password, pick, juice, matchup, league, tier, unit_size, date } = req.body;
    const index = parseInt(req.params.index);
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    if (fs.existsSync(PENDING_PATH)) {
        let data = JSON.parse(fs.readFileSync(PENDING_PATH));
        const plays = data.pending_plays || [];
        if (index >= 0 && index < plays.length) {
            if (pick)      plays[index].pick      = pick;
            if (juice)     plays[index].juice     = juice;
            if (league)    plays[index].league    = league;
            if (tier)      plays[index].tier      = tier;
            if (unit_size) plays[index].unit_size = unit_size;
            if (date)      plays[index].date      = date;
            if (matchup) {
                plays[index].matchup   = matchup;
                const parts = matchup.split('@').map(s => s.trim());
                plays[index].away_team = parts[0] || plays[index].away_team || '';
                plays[index].home_team = parts[1] || plays[index].home_team || '';
            }
            plays[index]._locked = true;
            data.pending_plays = plays;
            fs.writeFileSync(PENDING_PATH, JSON.stringify(data, null, 2));
            return res.status(200).send('Updated');
        }
    }
    res.status(404).send('Not found');
});

// --- REPAIR PENDING DATA ---
app.post('/admin/repair-pending', (req, res) => {
    const { password } = req.body;
    if (password !== PASSWORD) return res.status(401).send('Unauthorized');
    const clean = { pending_plays: [] };
    const dir = path.dirname(PENDING_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PENDING_PATH, JSON.stringify(clean, null, 2));
    res.status(200).json({ ok: true, message: 'pending.json reset to empty' });
});

// --- FIREBASE PUSH NOTIFICATION TO ADMIN ---
app.post('/api/notify-admin', async (req, res) => {
    const { memberName, messageText, fcmToken } = req.body || {};
    if (!fcmToken) return res.json({ ok: false, error: 'No admin FCM token provided' });

    const admin = getFirebaseAdmin();
    if (!admin) {
        console.log('[NOTIFY] ⚠️  FIREBASE_SERVICE_ACCOUNT not set — skipping push');
        return res.json({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT not configured' });
    }

    try {
        await admin.messaging().send({
            token: fcmToken,
            notification: {
                title: `💬 Message from ${memberName || 'a member'}`,
                body:  (messageText || 'New message').slice(0, 100),
            },
            webpush: {
                notification: { icon: '/icons/icon-192.png' },
                fcmOptions:   { link: 'https://app.prophetable.tv/community' },
            },
        });
        console.log(`[NOTIFY] ✅ Push sent to admin — from: ${memberName}`);
        res.json({ ok: true });
    } catch (err) {
        console.log(`[NOTIFY] ❌ Push failed: ${err.message}`);
        res.json({ ok: false, error: err.message });
    }
});

app.listen(PORT, "0.0.0.0", () => { console.log('Syndicate Engine Active'); });
