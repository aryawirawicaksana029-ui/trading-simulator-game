// ================= GAME STATE =================
let balance = 10000;
let position = null;
let entryPrice = 0;
let slPrice = 0;
let tpPrice = 0;
let currentPrice = 200;
let candleHistory = [];      // used to calculate sentiment
let timeCounter = Math.floor(Date.now() / 1000);
let currentLevel = 0;
let gameInterval = null;
let slLine = null;
let tpLine = null;

// --- Market Mode State Machine ---
let marketMode = "NEUTRAL";   // TREND_UP, TREND_DOWN, RANGING, NEUTRAL, WHIPSAW, FAKE_BREAKOUT, FLASH_CRASH_RECOVERY
let modeCounter = 0;
let modeDuration = 15;
let priceCeiling = 0;
let priceFloor = 0;
let crashCandlesLeft = 0;

// --- Advanced Pattern State (Level 3+) ---
let fakeBreakoutCandle = -1;      // which candle within the mode triggers the lure
let fakeBreakoutDirection = null; // "UP" or "DOWN" — which way the lure broke, so the trap snaps back opposite
let flashCrashCounter = 0;        // candle position within a FLASH_CRASH_RECOVERY mode

// --- AI Coach State (Groq API) ---
let groqApiKey = "";
let groqModel = "openai/gpt-oss-20b";
let aiCoachEnabled = false;
let aiRequestInFlight = false;

// --- Trading Diary State ---
let tradeLog = [];        // full history of trades this run: entry + exit details + AI commentary
let openTradeId = null;   // id of the currently open trade in tradeLog, or null

// --- Interactive Tutorial State (Level 0) ---
let tutorialActive = false;
let tutorialStep = 0;

const levels = [
    { name: "Level 1: Calm Market", target: 12000, volatility: 15, speed: 1000, patternSet: [] },
    { name: "Level 2: Stormy Market",  target: 16000, volatility: 40, speed: 600, patternSet: [] },
    { name: "Level 3: Choppy Waters", target: 20000, volatility: 50, speed: 500, patternSet: ["WHIPSAW"] },
    { name: "Level 4: Bull & Bear Traps", target: 25000, volatility: 60, speed: 450, patternSet: ["WHIPSAW", "FAKE_BREAKOUT"] },
    { name: "Level 5: Black Swan", target: 32000, volatility: 75, speed: 350, patternSet: ["WHIPSAW", "FAKE_BREAKOUT", "FLASH_CRASH_RECOVERY"], crashChance: 0.18 },
];

// ================= CHART SETUP =================
const chart = LightweightCharts.createChart(document.getElementById('chartContainer'), {
    width: 720,
    height: 380,
    layout: {
        background: { color: '#16213e' },
        textColor: '#eaeaea',
    },
    grid: {
        vertLines: { color: '#22224a' },
        horzLines: { color: '#22224a' },
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: true,
    },
});

const candleSeries = chart.addCandlestickSeries({
    upColor: '#00b4d8',
    downColor: '#ff4d6d',
    borderVisible: false,
    wickUpColor: '#00b4d8',
    wickDownColor: '#ff4d6d',
});

// ================= CORE MARKET LOGIC =================
function generateNewCandle() {
    const vol = levels[currentLevel].volatility;
    let open = currentPrice;
    let change;

    // PRIORITY 1: Crash - overrides all other modes
    if (crashCandlesLeft > 0 || checkCrashTrigger()) {
        change = -(vol * 3 + Math.random() * vol);
        crashCandlesLeft -= 1;
        updateModeUI("💥 CRASH!");
    }
    // PRIORITY 2: Floor & Ceiling (RANGING) - bounces at boundaries
    else if (marketMode === "RANGING") {
        let distToCeiling = priceCeiling - currentPrice;
        let distToFloor = currentPrice - priceFloor;
        if (distToCeiling < vol) {
            change = -(Math.random() * vol);        // near ceiling, force down
        } else if (distToFloor < vol) {
            change = Math.random() * vol;            // near floor, force up
        } else {
            change = (Math.random() - 0.5) * vol;
        }
        updateModeUI("↔️ Floor & Ceiling");
    }
    // PRIORITY 2b: Whipsaw - violent, directionless chop (Level 3+)
    else if (marketMode === "WHIPSAW") {
        change = (Math.random() - 0.5) * vol * 3;
        updateModeUI("🌊 Whipsaw (Choppy)");
    }
    // PRIORITY 2c: Fake Breakout - a Floor & Ceiling that lures a breakout trade, then traps it (Level 4+)
    else if (marketMode === "FAKE_BREAKOUT") {
        let distToCeiling = priceCeiling - currentPrice;
        let distToFloor = currentPrice - priceFloor;

        if (modeCounter === fakeBreakoutCandle) {
            // Lure: price punches decisively through a boundary
            const breakUp = Math.random() > 0.5;
            fakeBreakoutDirection = breakUp ? "UP" : "DOWN";
            change = breakUp ? (vol * 1.8 + Math.random() * vol) : -(vol * 1.8 + Math.random() * vol);
            updateModeUI("⚠️ Breakout?!");
        } else if (modeCounter === fakeBreakoutCandle + 1 || modeCounter === fakeBreakoutCandle + 2) {
            // Trap: snaps back hard the opposite way, punishing anyone who chased the lure
            change = fakeBreakoutDirection === "UP"
                ? -(vol * 2 + Math.random() * vol)
                : (vol * 2 + Math.random() * vol);
            updateModeUI("🪤 Fake Breakout Trap!");
        } else if (distToCeiling < vol) {
            change = -(Math.random() * vol);
            updateModeUI("↔️ Floor & Ceiling");
        } else if (distToFloor < vol) {
            change = Math.random() * vol;
            updateModeUI("↔️ Floor & Ceiling");
        } else {
            change = (Math.random() - 0.5) * vol;
            updateModeUI("↔️ Floor & Ceiling");
        }
    }
    // PRIORITY 2d: Flash Crash + V-Recovery - sharp drop, then a sharp bounce back (Level 5)
    else if (marketMode === "FLASH_CRASH_RECOVERY") {
        if (flashCrashCounter < 4) {
            change = -(vol * 2.5 + Math.random() * vol);
            updateModeUI("💥 Flash Crash!");
        } else {
            change = vol * 2 + Math.random() * vol;
            updateModeUI("🚀 V-Recovery!");
        }
        flashCrashCounter += 1;
    }
    // PRIORITY 3: Upward Trend
    else if (marketMode === "TREND_UP") {
        change = (Math.random() * vol) - (vol * 0.25);   // upward bias
        updateModeUI("📈 Upward Trend");
    }
    // PRIORITY 4: Downward Trend
    else if (marketMode === "TREND_DOWN") {
        change = -(Math.random() * vol) + (vol * 0.25);  // downward bias
        updateModeUI("📉 Downward Trend");
    }
    // FALLBACK: Pure Neutral
    else {
        change = (Math.random() - 0.5) * vol * 2;
        updateModeUI("⏸️ Neutral");
    }

    let close = open + change;
    let high = Math.max(open, close) + Math.random() * (vol / 3);
    let low  = Math.min(open, close) - Math.random() * (vol / 3);

    timeCounter += 1;

    const candle = { time: timeCounter, open, high, low, close };
    candleSeries.update(candle);

    candleHistory.push({ open, close });
    if (candleHistory.length > 50) candleHistory.shift();

    currentPrice = close;
    document.getElementById('priceText').innerText = currentPrice.toFixed(2);

    // Check if it's time for the market to switch modes
    modeCounter += 1;
    if (crashCandlesLeft === 0 && modeCounter >= modeDuration) {
        decideNextMode();
    }
}

function checkCrashTrigger() {
    let fg = calculateFearGreed();
    let longUptrend = marketMode === "TREND_UP" && modeCounter > 8;
    const crashChance = levels[currentLevel].crashChance !== undefined ? levels[currentLevel].crashChance : 0.10;
    if ((fg > 80 || longUptrend) && Math.random() < crashChance) {
        crashCandlesLeft = 3;
        return true;
    }
    return false;
}

function setRangingBounds() {
    priceCeiling = currentPrice * 1.06;
    priceFloor = currentPrice * 0.94;
}

function decideNextMode() {
    let fg = calculateFearGreed();
    modeCounter = 0;
    modeDuration = 10 + Math.floor(Math.random() * 15); // 10-25 candles

    // Levels 3+ can roll one of their advanced patterns instead of a basic mode
    const patternSet = levels[currentLevel].patternSet || [];
    if (patternSet.length > 0 && Math.random() < 0.35) {
        const chosen = patternSet[Math.floor(Math.random() * patternSet.length)];
        marketMode = chosen;

        if (chosen === "FAKE_BREAKOUT") {
            setRangingBounds();
            fakeBreakoutCandle = 4 + Math.floor(Math.random() * (modeDuration - 6));
            fakeBreakoutDirection = null;
        } else if (chosen === "FLASH_CRASH_RECOVERY") {
            modeDuration = 8; // short, self-contained V-shaped pattern
            flashCrashCounter = 0;
        }
        // WHIPSAW needs no extra setup
        return;
    }

    if (fg > 70) {
        marketMode = "RANGING";
        setRangingBounds();
    } else if (fg >= 45 && fg <= 55) {
        marketMode = "RANGING";
        setRangingBounds();
    } else if (fg < 30) {
        marketMode = "TREND_UP";
    } else {
        marketMode = Math.random() > 0.5 ? "TREND_UP" : "TREND_DOWN";
    }
}

function updateModeUI(label) {
    document.getElementById('modeText').innerText = label;
}

function gameTick() {
    generateNewCandle();
    checkAutomation();
    updateSentimentUI();
}

// ================= FEAR & GREED =================
function calculateFearGreed() {
    if (candleHistory.length < 5) return 50;
    let recent = candleHistory.slice(-5);
    let totalUp = 0, totalAbs = 0;
    recent.forEach(c => {
        let ch = c.close - c.open;
        if (ch > 0) totalUp += ch;
        totalAbs += Math.abs(ch);
    });
    if (totalAbs === 0) return 50;
    return Math.round((totalUp / totalAbs) * 100);
}

function updateSentimentUI() {
    let idx = calculateFearGreed();
    document.getElementById('sentimentMarker').style.left = idx + '%';
    let status;
    if (idx >= 80) status = "🔴 EXTREME GREED";
    else if (idx >= 60) status = "🟡 GREED";
    else if (idx > 40) status = "🟢 NEUTRAL";
    else if (idx > 20) status = "🔵 FEAR";
    else status = "💀 EXTREME FEAR";
    document.getElementById('sentimentText').innerText = `${status} (${idx})`;
}

// ================= AI COACH (Groq) =================
// NOTE ON SECURITY: This is a static, no-backend site, so the Groq key the
// player enters lives only in this browser tab (memory, or sessionStorage if
// they opt in) and is sent straight from the browser to Groq's API. That's
// fine for personal/local use, but never ship a build where YOUR OWN key is
// hardcoded here — anyone could read it from the page source and spend your
// quota. If this game ever gets a real backend (see README's Flask idea),
// move this fetch call server-side and keep the key off the client entirely.

const AI_COACH_SYSTEM_PROMPT =
    "You are \"Coach\", the in-game AI commentator for a beginner-friendly " +
    "trading simulator called Trading Simulator Pro. The game follows a strict " +
    "Zero Jargon philosophy: NEVER use real trading terms like RSI, support/resistance, " +
    "moving average, or Fibonacci. Use only the game's own vocabulary: \"Floor & Ceiling\" " +
    "instead of support/resistance, \"Seatbelt\" instead of Stop Loss/Take Profit, and " +
    "\"Fear\"/\"Greed\" for sentiment. Reply with exactly ONE short sentence (max 25 words), " +
    "punchy and a little playful, never robotic, and never give real financial advice — " +
    "this is a game about building intuition and discipline, not real trading signals.";

const FALLBACK_LINES = {
    BUY: {
        extreme_greed: [
            "Buying into Extreme Greed — bold move, but that's usually when the Ceiling gives way. 👀",
            "Everyone's greedy right now. Buying here really needs a tight Seatbelt."
        ],
        greed: [
            "Market's feeling good. Just don't forget your Seatbelt.",
            "Buying on Greed — reasonable, but stay alert for a reversal."
        ],
        neutral: [
            "Solid, level-headed entry. No strong emotion in the market right now.",
            "Calm market, calm entry — that's exactly how it should be."
        ],
        fear: [
            "Buying into Fear takes nerve — could pay off if this is the bottom.",
            "Contrarian move, buying on Fear. Respect the risk either way."
        ],
        extreme_fear: [
            "Extreme Fear and you're still buying? That's either genius or gutsy.",
            "Buying at Extreme Fear — the classic 'be greedy when others are fearful' play."
        ]
    },
    SELL_PROFIT: [
        "Nice, your Seatbelt did its job and you banked the win. 💰",
        "Profit secured. Discipline pays, literally.",
        "Clean exit — that's how consistent traders are built."
    ],
    SELL_LOSS: [
        "Small loss, lesson learned — that's the game.",
        "Not every trade wins. What matters is you didn't blow up the account.",
        "Loss taken on your terms, not the market's. Still a win in habit."
    ],
    SELL_TP: [
        "🎉 Take Profit did the work for you — set it and forget it.",
        "That's the Seatbelt paying you back."
    ],
    SELL_SL: [
        "💥 Stop Loss saved you from a bigger hit. That's exactly what it's for.",
        "Stopped out — stings, but your account lives to trade another day."
    ],
    LEVEL_CLEAR: [
        "Target smashed! Your risk management is actually working.",
        "Level cleared — the market didn't beat you this time."
    ],
    GAME_OVER: [
        "Bankrupt happens to everyone once — the fix is always the Seatbelt.",
        "Game over, but this is exactly how the discipline gets built."
    ]
};

function fgLabel(idx) {
    if (idx >= 80) return "extreme_greed";
    if (idx >= 60) return "greed";
    if (idx > 40) return "neutral";
    if (idx > 20) return "fear";
    return "extreme_fear";
}

function pickFallback(category, subcat) {
    const pool = subcat ? FALLBACK_LINES[category][subcat] : FALLBACK_LINES[category];
    return pool[Math.floor(Math.random() * pool.length)];
}

function fallbackFor(context) {
    switch (context.type) {
        case "BUY": return pickFallback("BUY", fgLabel(context.fearGreed));
        case "SELL_MANUAL": return pickFallback(context.profit >= 0 ? "SELL_PROFIT" : "SELL_LOSS");
        case "SELL_TP": return pickFallback("SELL_TP");
        case "SELL_SL": return pickFallback("SELL_SL");
        case "LEVEL_CLEAR": return pickFallback("LEVEL_CLEAR");
        case "GAME_OVER": return pickFallback("GAME_OVER");
        default: return "Watching the market with you.";
    }
}

function buildAIPrompt(context) {
    const fgIdx = context.fearGreed;
    const fgWord = fgIdx !== undefined ? fgLabel(fgIdx).replace(/_/g, " ") : "unknown";
    const mode = marketMode.replace(/_/g, " ").toLowerCase();

    switch (context.type) {
        case "BUY":
            return `The player just opened a BUY position at price $${context.price.toFixed(2)}. ` +
                `Current market sentiment is ${fgWord} (index ${fgIdx}/100). Market condition: ${mode}. ` +
                `Their Seatbelt: Stop Loss $${context.slDist} away, Take Profit $${context.tpDist} away. ` +
                `React to this decision in one short sentence.`;
        case "SELL_MANUAL":
            return `The player manually closed their position with a ${context.profit >= 0 ? "profit" : "loss"} ` +
                `of $${Math.abs(context.profit).toFixed(2)}. Market sentiment at close: ${fgWord} (index ${fgIdx}/100). ` +
                `React to this decision in one short sentence.`;
        case "SELL_TP":
            return `The player's Take Profit Seatbelt auto-triggered, securing a profit of $${context.profit.toFixed(2)}. ` +
                `Give one short, congratulatory reaction.`;
        case "SELL_SL":
            return `The player's Stop Loss Seatbelt auto-triggered, limiting their loss to $${Math.abs(context.profit).toFixed(2)}. ` +
                `Give one short, supportive (not scolding) reaction.`;
        case "LEVEL_CLEAR":
            return `The player cleared the level with a final balance of $${context.balance.toFixed(2)} ` +
                `(target was $${context.target}). Give one short, celebratory reaction.`;
        case "GAME_OVER":
            return `The player went bankrupt (balance hit $0). Give one short, encouraging-but-honest reaction ` +
                `about what habit to fix next time.`;
        default:
            return "Give one short, one-line trading tip.";
    }
}

function setAICoachText(text, thinking = false) {
    const el = document.getElementById("aiCoachText");
    el.innerText = text;
    el.classList.toggle("thinking", thinking);
}

function recordCommentaryToLog(context, text) {
    if (context.tradeId === undefined || context.tradeId === null) return;
    const trade = tradeLog.find(t => t.id === context.tradeId);
    if (!trade) return;
    if (context.type === "BUY") trade.entryComment = text;
    else trade.exitComment = text;
}

function updateAICoachStatusUI() {
    const dot = document.getElementById("aiCoachStatus");
    if (!aiCoachEnabled) dot.innerText = "⚪ Off";
    else if (groqApiKey) dot.innerText = "🟢 Live (Groq)";
    else dot.innerText = "🟡 Fallback mode";
}

async function requestAICommentary(context) {
    if (!aiCoachEnabled) return;

    // No key entered yet -> just use a canned line, no network call.
    if (!groqApiKey) {
        const text = fallbackFor(context);
        setAICoachText(text);
        recordCommentaryToLog(context, text);
        return;
    }

    // Avoid piling up overlapping requests if several triggers fire close together.
    if (aiRequestInFlight) return;
    aiRequestInFlight = true;
    setAICoachText("Coach is thinking", true);

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
                model: groqModel,
                messages: [
                    { role: "system", content: AI_COACH_SYSTEM_PROMPT },
                    { role: "user", content: buildAIPrompt(context) }
                ],
                temperature: 0.85,
                max_tokens: 60
            })
        });

        if (!response.ok) throw new Error(`Groq API responded with ${response.status}`);

        const data = await response.json();
        const text = data.choices && data.choices[0] && data.choices[0].message.content
            ? data.choices[0].message.content.trim()
            : fallbackFor(context);

        setAICoachText(text);
        recordCommentaryToLog(context, text);
    } catch (err) {
        console.warn("AI Coach: falling back to canned commentary —", err);
        const text = fallbackFor(context) + " (offline commentary — Groq request failed)";
        setAICoachText(text);
        recordCommentaryToLog(context, text);
    } finally {
        aiRequestInFlight = false;
    }
}

// --- AI Settings Modal wiring ---
function loadAISettingsFromSession() {
    const saved = sessionStorage.getItem("aiCoachSettings");
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        groqApiKey = parsed.apiKey || "";
        groqModel = parsed.model || groqModel;
        aiCoachEnabled = !!parsed.enabled;
    } catch (e) { /* ignore corrupt session data */ }
}

function openAISettings() {
    document.getElementById("groqApiKeyInput").value = groqApiKey;
    document.getElementById("groqModelSelect").value = groqModel;
    document.getElementById("aiEnabledCheckbox").checked = aiCoachEnabled;
    document.getElementById("rememberKeyCheckbox").checked = sessionStorage.getItem("aiCoachSettings") !== null;
    showOverlay("aiSettingsOverlay");
}

function saveAISettings() {
    groqApiKey = document.getElementById("groqApiKeyInput").value.trim();
    groqModel = document.getElementById("groqModelSelect").value;
    aiCoachEnabled = document.getElementById("aiEnabledCheckbox").checked;
    const remember = document.getElementById("rememberKeyCheckbox").checked;

    if (remember) {
        sessionStorage.setItem("aiCoachSettings", JSON.stringify({
            apiKey: groqApiKey, model: groqModel, enabled: aiCoachEnabled
        }));
    } else {
        sessionStorage.removeItem("aiCoachSettings");
    }

    updateAICoachStatusUI();
    hideAllOverlays();

    if (aiCoachEnabled) {
        unlockAchievement("ai_believer");
        setAICoachText(groqApiKey
            ? "AI Coach is live. Make your move!"
            : "⚠️ No API key set — using built-in fallback commentary instead of Groq.");
    } else {
        setAICoachText("AI Coach is turned off.");
    }
}

// ================= TRADING DIARY / REPLAY =================
function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fgWordLabel(idx) {
    if (idx === undefined || idx === null) return "Unknown sentiment";
    const labels = {
        extreme_greed: "🔴 Extreme Greed",
        greed: "🟡 Greed",
        neutral: "🟢 Neutral",
        fear: "🔵 Fear",
        extreme_fear: "💀 Extreme Fear"
    };
    return `${labels[fgLabel(idx)]} (${idx})`;
}

const EXIT_REASON_LABEL = {
    MANUAL: "Manual Sell",
    SL: "Seatbelt: Stop Loss",
    TP: "Seatbelt: Take Profit"
};

function renderTradingDiary() {
    const listEl = document.getElementById("diaryList");
    const summaryEl = document.getElementById("diarySummary");

    if (tradeLog.length === 0) {
        listEl.innerHTML = `<p class="diaryEmpty">No trades yet — your diary fills up as you play.</p>`;
        summaryEl.innerHTML = "";
        return;
    }

    const closedTrades = tradeLog.filter(t => t.exitPrice !== null);
    const wins = closedTrades.filter(t => t.profit > 0).length;
    const netPL = closedTrades.reduce((sum, t) => sum + t.profit, 0);
    const winRate = closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : 0;

    summaryEl.innerHTML = `
        <div class="diaryStat"><span class="label">TRADES</span><span class="value">${tradeLog.length}</span></div>
        <div class="diaryStat"><span class="label">WIN RATE</span><span class="value">${winRate}%</span></div>
        <div class="diaryStat"><span class="label">NET P/L</span><span class="value" style="color:${netPL >= 0 ? '#00e0a1' : '#ff4d6d'}">$${netPL.toFixed(2)}</span></div>
    `;

    listEl.innerHTML = tradeLog.map(t => {
        const isOpen = t.exitPrice === null;
        const isProfit = !isOpen && t.profit >= 0;
        const reasonLabel = EXIT_REASON_LABEL[t.exitReason] || "Still Open";

        return `
            <div class="diaryEntry ${isOpen ? "" : (isProfit ? "profit" : "loss")}">
                <div class="diaryEntryHead">
                    <span>Trade #${t.id + 1} · ${escapeHtml(t.level)}</span>
                    <span class="diaryPL ${isOpen ? "" : (isProfit ? "profit-text" : "loss-text")}">
                        ${isOpen ? "Open" : (isProfit ? "+" : "") + "$" + t.profit.toFixed(2)}
                    </span>
                </div>
                <div class="diaryMeta">
                    Entry $${t.entryPrice.toFixed(2)} · ${fgWordLabel(t.entryFG)} · ${escapeHtml(t.entryMode.replace(/_/g, " "))}
                    ${isOpen ? "" : ` → Exit $${t.exitPrice.toFixed(2)} (${reasonLabel})`}
                </div>
                ${t.entryComment ? `<div class="diaryComment">🤖 On entry: "${escapeHtml(t.entryComment)}"</div>` : ""}
                ${t.exitComment ? `<div class="diaryComment">🤖 On exit: "${escapeHtml(t.exitComment)}"</div>` : ""}
            </div>
        `;
    }).join("");
}

function openTradingDiary() {
    unlockAchievement("diary_keeper");
    renderTradingDiary();
    showOverlay("tradingDiaryOverlay");
}

function closeDiary() {
    document.getElementById("tradingDiaryOverlay").classList.remove("show");
}

// ================= INTERACTIVE TUTORIAL (Level 0) =================
// Each step highlights a real UI element and shows a floating hint box near it.
// gate: 'button' = player just reads and clicks Next.
// gate: 'action' = player must actually perform the action; `check()` is polled
//                  after every buy()/sell() to see if the step is complete.
// gate: 'finish' = last step, hands off into a real Level 1 run.
const TUTORIAL_STEPS = [
    {
        target: null,
        gate: "button",
        text: "Welcome to Trading Simulator Pro! 👋 This quick walkthrough teaches you the basics in under a minute — no experience needed."
    },
    {
        target: "#chartContainer",
        gate: "button",
        text: "This is the live market. Green candles mean price went up, red means it went down — watch it move in real time."
    },
    {
        target: "#sentimentBar",
        gate: "button",
        text: "This is the Fear &amp; Greed meter. When it swings to Greed 🤑, everyone's excited — often right before a drop. When it swings to Fear 😨, everyone's scared — sometimes right before a bounce."
    },
    {
        target: "#infoRow",
        gate: "button",
        text: "Here's your Balance, the current Price, and your open Position at a glance."
    },
    {
        target: "#buyBtn",
        gate: "action",
        actionHint: "Click BUY, then set a Stop Loss / Take Profit distance to open your first position.",
        check: () => position === "LONG",
        text: "Time to trade! Click BUY below — you'll be asked to set your Seatbelt (a Stop Loss and Take Profit distance) before the trade opens."
    },
    {
        target: "#chartContainer",
        gate: "button",
        text: "See the dashed red and green lines? That's your Seatbelt. Price hits red → the trade closes automatically at a loss. Price hits green → it closes automatically at a profit."
    },
    {
        target: "#sellBtn",
        gate: "action",
        actionHint: "Click SELL to close manually, or just wait — your Seatbelt will do it for you.",
        check: () => position === null && tradeLog.length > 0 && tradeLog[tradeLog.length - 1].exitPrice !== null,
        text: "You can close anytime with SELL — or let your Seatbelt handle it. Try either one now."
    },
    {
        target: "#aiSettingsBtn",
        gate: "button",
        text: "This is your AI Coach 🤖. Turn it on and add a free Groq API key to get real-time feedback on every trade you make."
    },
    {
        target: "#diaryBtn",
        gate: "button",
        text: "Every trade — win or lose — gets saved in your 📔 Trading Diary, so you can review your decisions later."
    },
    {
        target: null,
        gate: "finish",
        text: "You're ready! 🎉 This was practice — no real risk was involved. Tap below to start Level 1 for real, and remember: always wear your Seatbelt."
    }
];

function startTutorial() {
    hideAllOverlays();
    tutorialActive = true;
    document.getElementById("levelText").innerText = "Level 0: Tutorial";
    document.getElementById("targetText").innerText = "—";
    showTutorialStep(0);
}

function showTutorialStep(index) {
    tutorialStep = index;
    const step = TUTORIAL_STEPS[index];

    document.querySelectorAll(".tutorialHighlight").forEach(el => el.classList.remove("tutorialHighlight"));

    const tooltip = document.getElementById("tutorialTooltip");
    tooltip.innerHTML = buildTutorialTooltipHTML(step, index);
    tooltip.classList.add("show");

    if (step.target) {
        const targetEl = document.querySelector(step.target);
        if (targetEl) {
            targetEl.classList.add("tutorialHighlight");
            positionTooltipNear(targetEl);
            return;
        }
    }
    positionTooltipCenter();
}

function buildTutorialTooltipHTML(step, index) {
    const counter = `Step ${index + 1} of ${TUTORIAL_STEPS.length}`;
    let actionHtml = "";
    if (step.gate === "button") {
        actionHtml = `<button onclick="tutorialNext()">Next →</button>`;
    } else if (step.gate === "action") {
        actionHtml = `<p class="tutorialActionHint">👉 ${step.actionHint}</p>`;
    } else if (step.gate === "finish") {
        actionHtml = `<button onclick="finishTutorial()">🚀 Finish Tutorial &amp; Start Level 1</button>`;
    }
    return `
        <div class="tutorialCounter">${counter}</div>
        <p class="tutorialText">${step.text}</p>
        ${actionHtml}
        <button class="tutorialSkip" onclick="skipTutorial()">Skip Tutorial</button>
    `;
}

function positionTooltipNear(targetEl) {
    const tooltip = document.getElementById("tutorialTooltip");
    const rect = targetEl.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 300;

    let placeAbove = rect.bottom + 180 > window.innerHeight;
    let top = placeAbove ? rect.top + window.scrollY - 12 : rect.bottom + window.scrollY + 12;
    let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipWidth / 2);
    left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.transform = placeAbove ? "translateY(-100%)" : "none";
}

function positionTooltipCenter() {
    const tooltip = document.getElementById("tutorialTooltip");
    tooltip.style.top = "50%";
    tooltip.style.left = "50%";
    tooltip.style.transform = "translate(-50%, -50%)";
}

function tutorialNext() {
    if (tutorialStep + 1 < TUTORIAL_STEPS.length) {
        showTutorialStep(tutorialStep + 1);
    }
}

function tutorialCheckAdvance() {
    if (!tutorialActive) return;
    const step = TUTORIAL_STEPS[tutorialStep];
    if (step.gate === "action" && typeof step.check === "function" && step.check()) {
        tutorialNext();
    }
}

function finishTutorial() {
    if (tutorialStep === TUTORIAL_STEPS.length - 1) unlockAchievement("graduate");
    tutorialActive = false;
    document.getElementById("tutorialTooltip").classList.remove("show");
    document.querySelectorAll(".tutorialHighlight").forEach(el => el.classList.remove("tutorialHighlight"));
    restartLevel(); // clean slate: real balance, empty diary, Level 1 for real
}

function skipTutorial() {
    finishTutorial();
}

// ================= SOUND EFFECTS =================
// Synthesized with the Web Audio API — no external audio files needed, so it
// works offline and doesn't add any assets to the project.
let soundEnabled = localStorage.getItem("soundEnabled") !== "false"; // default ON
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Browsers suspend AudioContext until a real user gesture; resume defensively.
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
}

// Plays one tone with a short volume envelope so it doesn't click at the edges.
function playTone(freq, startOffset, duration, type = "sine", peakVolume = 0.2) {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const t0 = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakVolume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
}

// notes: array of [frequency, startOffset, duration]
function playSequence(notes, type, peakVolume) {
    notes.forEach(([freq, start, dur]) => playTone(freq, start, dur, type, peakVolume));
}

function playSound(name) {
    if (!soundEnabled) return;
    try {
        switch (name) {
            case "buy": // short, subtle click when a position opens
                playTone(520, 0, 0.09, "triangle", 0.12);
                break;
            case "profit": // bright ascending two-note chime, manual close in the green
                playSequence([[660, 0, 0.14], [880, 0.1, 0.18]], "sine", 0.18);
                break;
            case "loss": // soft descending dip, manual close in the red — not harsh
                playSequence([[300, 0, 0.16], [220, 0.12, 0.22]], "sine", 0.16);
                break;
            case "tp": // celebratory 3-note ascending arpeggio — Take Profit Seatbelt
                playSequence([[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.25]], "triangle", 0.2);
                break;
            case "sl": // duller two-note thud — Stop Loss Seatbelt (a save, not a failure)
                playSequence([[196, 0, 0.15], [164, 0.1, 0.28]], "sawtooth", 0.14);
                break;
            case "levelClear": // 4-note fanfare
                playSequence([[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]], "triangle", 0.2);
                break;
            case "gameOver": // low descending tone
                playSequence([[220, 0, 0.2], [180, 0.18, 0.2], [140, 0.36, 0.4]], "sawtooth", 0.15);
                break;
            case "achievement": // bright 3-note sparkle, distinct from Take Profit's arpeggio
                playSequence([[784, 0, 0.1], [988, 0.08, 0.1], [1175, 0.16, 0.3]], "triangle", 0.22);
                break;
        }
    } catch (e) {
        console.warn("Sound playback failed:", e);
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem("soundEnabled", soundEnabled ? "true" : "false");
    updateSoundButtonUI();
    if (soundEnabled) playSound("buy"); // quick audible confirmation it's back on
}

function updateSoundButtonUI() {
    document.getElementById("soundToggleBtn").innerText = soundEnabled ? "🔊 Sound" : "🔇 Sound";
}

// ================= ACHIEVEMENTS =================
const ACHIEVEMENTS = [
    { id: "first_trade", icon: "🥇", title: "First Trade", desc: "Complete your very first trade." },
    { id: "seatbelt_streak", icon: "🎗️", title: "Always Buckled Up", desc: "Complete 10 trades — every one of them with a Seatbelt (Stop Loss) set." },
    { id: "hot_streak", icon: "🔥", title: "Hot Streak", desc: "Win 3 trades in a row." },
    { id: "seatbelt_saved", icon: "🛟", title: "Seatbelt Saved Me", desc: "Get stopped out by your own Stop Loss 5 times — and live to trade another day." },
    { id: "sniper", icon: "🎯", title: "Sniper", desc: "Hit your Take Profit target 5 times." },
    { id: "contrarian", icon: "💎", title: "Contrarian", desc: "Buy while the market is in Extreme Fear." },
    { id: "rode_the_wave", icon: "🎢", title: "Rode the Wave", desc: "Buy during Extreme Greed and still close the trade in profit." },
    { id: "level_clear_1", icon: "🎉", title: "Level 1 Cleared", desc: "Reach the target balance in Level 1: Calm Market." },
    { id: "champion", icon: "🏆", title: "Trading Champion", desc: "Complete every level in the game." },
    { id: "comeback_kid", icon: "🔄", title: "Comeback Kid", desc: "Bounce back from a Game Over and try again." },
    { id: "ai_believer", icon: "🤖", title: "AI Believer", desc: "Turn on the AI Coach." },
    { id: "diary_keeper", icon: "📔", title: "Diary Keeper", desc: "Open your Trading Diary for the first time." },
    { id: "graduate", icon: "🎓", title: "Graduate", desc: "Complete the interactive tutorial." },
    { id: "big_balance", icon: "💰", title: "Big Balance", desc: "Reach a $20,000 balance." }
];

let unlockedAchievements = new Set(JSON.parse(localStorage.getItem("unlockedAchievements") || "[]"));
let winStreak = 0;
let slCount = 0;
let tpCount = 0;
let cameFromGameOver = false;

function unlockAchievement(id) {
    if (unlockedAchievements.has(id)) return; // already unlocked, no-op
    unlockedAchievements.add(id);
    localStorage.setItem("unlockedAchievements", JSON.stringify([...unlockedAchievements]));
    const badge = ACHIEVEMENTS.find(a => a.id === id);
    if (badge) showAchievementToast(badge);
    playSound("achievement");
}

function showAchievementToast(badge) {
    const container = document.getElementById("achievementToasts");
    const toast = document.createElement("div");
    toast.className = "achievementToast";
    toast.innerHTML = `
        <div class="achievementToastIcon">${badge.icon}</div>
        <div>
            <div class="achievementToastLabel">ACHIEVEMENT UNLOCKED</div>
            <div class="achievementToastTitle">${escapeHtml(badge.title)}</div>
            <div class="achievementToastDesc">${escapeHtml(badge.desc)}</div>
        </div>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 4200);
}

function renderAchievementsPanel() {
    document.getElementById("achievementsCount").innerText =
        `${unlockedAchievements.size} / ${ACHIEVEMENTS.length} unlocked`;

    document.getElementById("achievementsList").innerHTML = ACHIEVEMENTS.map(a => {
        const unlocked = unlockedAchievements.has(a.id);
        return `
            <div class="achievementRow ${unlocked ? "unlocked" : "locked"}">
                <div class="achievementRowIcon">${unlocked ? a.icon : "🔒"}</div>
                <div>
                    <div class="achievementRowTitle">${escapeHtml(a.title)}</div>
                    <div class="achievementRowDesc">${escapeHtml(a.desc)}</div>
                </div>
            </div>
        `;
    }).join("");
}

function openAchievements() {
    renderAchievementsPanel();
    showOverlay("achievementsOverlay");
}

// ================= TRADING ACTIONS =================
function buy() {
    if (position !== null) {
        alert("You already have an open position! Sell it first before buying again.");
        return;
    }
    let inputSL = prompt("Enter STOP LOSS distance (in $):", "10");
    let inputTP = prompt("Enter TAKE PROFIT distance (in $):", "20");
    let slDist = parseFloat(inputSL);
    let tpDist = parseFloat(inputTP);

    if (isNaN(slDist) || isNaN(tpDist) || slDist <= 0 || tpDist <= 0) {
        alert("Invalid input! Please enter a number greater than 0.");
        return;
    }

    position = "LONG";
    entryPrice = currentPrice;
    slPrice = entryPrice - slDist;
    tpPrice = entryPrice + tpDist;

    if (slLine) candleSeries.removePriceLine(slLine);
    if (tpLine) candleSeries.removePriceLine(tpLine);

    slLine = candleSeries.createPriceLine({
        price: slPrice, color: '#ff4d6d', lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true, title: 'SL'
    });
    tpLine = candleSeries.createPriceLine({
        price: tpPrice, color: '#00e0a1', lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true, title: 'TP'
    });

    document.getElementById('positionText').innerHTML =
        `LONG @ $${entryPrice.toFixed(2)}`;

    const tradeId = tradeLog.length;
    const entryFG = calculateFearGreed();
    tradeLog.push({
        id: tradeId,
        level: levels[currentLevel].name,
        entryPrice,
        entryFG,
        entryMode: marketMode,
        slDist, tpDist,
        exitPrice: null, exitReason: null, profit: null, exitFG: null,
        entryComment: null, exitComment: null
    });
    openTradeId = tradeId;

    if (entryFG <= 20) unlockAchievement("contrarian");

    requestAICommentary({ type: "BUY", price: entryPrice, slDist, tpDist, fearGreed: entryFG, tradeId });
    playSound("buy");
    tutorialCheckAdvance();
}

function sell(reason = "MANUAL") {
    if (position !== "LONG") {
        if (reason === "MANUAL") alert("You do not have any open position to sell!");
        return;
    }
    let profit = currentPrice - entryPrice;
    balance += profit;
    document.getElementById('balanceText').innerText = balance.toFixed(2);
    document.getElementById('positionText').innerText = "None";
    position = null;

    if (slLine) { candleSeries.removePriceLine(slLine); slLine = null; }
    if (tpLine) { candleSeries.removePriceLine(tpLine); tpLine = null; }

    if (reason === "MANUAL") alert(`Profit/Loss: $${profit.toFixed(2)}`);

    const fg = calculateFearGreed();
    const closedTradeId = openTradeId;
    let closedTrade = null;
    if (closedTradeId !== null) {
        closedTrade = tradeLog.find(t => t.id === closedTradeId);
        if (closedTrade) {
            closedTrade.exitPrice = currentPrice;
            closedTrade.exitReason = reason;
            closedTrade.profit = profit;
            closedTrade.exitFG = fg;
        }
        openTradeId = null;
    }

    if (reason === "MANUAL") requestAICommentary({ type: "SELL_MANUAL", profit, fearGreed: fg, tradeId: closedTradeId });
    else if (reason === "TP") requestAICommentary({ type: "SELL_TP", profit, fearGreed: fg, tradeId: closedTradeId });
    else if (reason === "SL") requestAICommentary({ type: "SELL_SL", profit, fearGreed: fg, tradeId: closedTradeId });

    if (reason === "TP") playSound("tp");
    else if (reason === "SL") playSound("sl");
    else playSound(profit >= 0 ? "profit" : "loss");

    // --- Achievement checks ---
    const closedCount = tradeLog.filter(t => t.exitPrice !== null).length;
    if (closedCount >= 1) unlockAchievement("first_trade");
    if (closedCount >= 10) unlockAchievement("seatbelt_streak"); // Stop Loss is mandatory on every trade in this game

    if (profit > 0) {
        winStreak++;
        if (winStreak >= 3) unlockAchievement("hot_streak");
    } else {
        winStreak = 0;
    }

    if (reason === "SL") { slCount++; if (slCount >= 5) unlockAchievement("seatbelt_saved"); }
    if (reason === "TP") { tpCount++; if (tpCount >= 5) unlockAchievement("sniper"); }

    if (closedTrade && closedTrade.entryFG >= 80 && profit > 0) unlockAchievement("rode_the_wave");
    if (balance >= 20000) unlockAchievement("big_balance");

    tutorialCheckAdvance();
    checkWinLose();
}

function checkAutomation() {
    if (position === "LONG") {
        if (currentPrice <= slPrice) {
            alert(`💥 STOP LOSS triggered! The system automatically closed your position at $${currentPrice.toFixed(2)}.`);
            sell("SL");
        } else if (currentPrice >= tpPrice) {
            alert(`🎉 TAKE PROFIT triggered! The system automatically secured your profit at $${currentPrice.toFixed(2)}.`);
            sell("TP");
        }
    }
}

// ================= LEVEL SYSTEM =================
function loadLevel(levelIndex) {
    currentLevel = levelIndex;
    candleSeries.setData([]);
    candleHistory = [];
    currentPrice = 200;
    timeCounter = Math.floor(Date.now() / 1000);
    marketMode = "NEUTRAL";
    modeCounter = 0;
    modeDuration = 15;
    crashCandlesLeft = 0;

    document.getElementById('levelText').innerText = levels[currentLevel].name;
    document.getElementById('targetText').innerText = levels[currentLevel].target;
    document.getElementById('priceText').innerText = currentPrice.toFixed(2);

    if (gameInterval) clearInterval(gameInterval);

    for (let i = 0; i < 10; i++) generateNewCandle(); // populate initial chart data so it's not empty
    gameInterval = setInterval(gameTick, levels[currentLevel].speed);
}

function checkWinLose() {
    if (tutorialActive) return; // no bankruptcy/target checks while practicing in the tutorial
    if (balance <= 0) {
        clearInterval(gameInterval);
        cameFromGameOver = true;
        requestAICommentary({ type: "GAME_OVER", balance });
        playSound("gameOver");
        showOverlay("gameOverOverlay");
    } else if (balance >= levels[currentLevel].target) {
        clearInterval(gameInterval);
        if (currentLevel === 0) unlockAchievement("level_clear_1");
        requestAICommentary({ type: "LEVEL_CLEAR", balance, target: levels[currentLevel].target });
        playSound("levelClear");
        if (currentLevel + 1 < levels.length) {
            document.getElementById('levelClearMsg').innerText =
                `Your balance of $${balance.toFixed(2)} has exceeded the target! Ready to proceed to ${levels[currentLevel+1].name}?`;
            showOverlay("levelClearOverlay");
        } else {
            unlockAchievement("champion");
            showOverlay("gameWinOverlay");
        }
    }
}

function showOverlay(id) {
    document.getElementById(id).classList.add("show");
}
function hideAllOverlays() {
    document.querySelectorAll(".overlay").forEach(el => el.classList.remove("show"));
}

function restartLevel() {
    hideAllOverlays();
    if (cameFromGameOver) {
        unlockAchievement("comeback_kid");
        cameFromGameOver = false;
    }
    balance = 10000;
    position = null;
    tradeLog = [];
    openTradeId = null;
    document.getElementById('balanceText').innerText = balance.toFixed(2);
    document.getElementById('positionText').innerText = "None";
    loadLevel(0);
}

function nextLevel() {
    hideAllOverlays();
    loadLevel(currentLevel + 1);
}

// ================= INIT =================
document.getElementById("buyBtn").addEventListener("click", buy);
document.getElementById("sellBtn").addEventListener("click", () => sell("MANUAL"));
document.getElementById("aiSettingsBtn").addEventListener("click", openAISettings);
document.getElementById("diaryBtn").addEventListener("click", openTradingDiary);
document.getElementById("tutorialBtn").addEventListener("click", startTutorial);
document.getElementById("soundToggleBtn").addEventListener("click", toggleSound);
document.getElementById("achievementsBtn").addEventListener("click", openAchievements);

updateSoundButtonUI();
loadAISettingsFromSession();
updateAICoachStatusUI();
if (aiCoachEnabled) {
    setAICoachText(groqApiKey
        ? "AI Coach is live. Make your move!"
        : "⚠️ No API key set — using built-in fallback commentary instead of Groq.");
}

loadLevel(0);
showOverlay("welcomeOverlay");
