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
let marketMode = "NEUTRAL";   // TREND_UP, TREND_DOWN, RANGING, NEUTRAL
let modeCounter = 0;
let modeDuration = 15;
let priceCeiling = 0;
let priceFloor = 0;
let crashCandlesLeft = 0;

// --- AI Coach State (Groq API) ---
let groqApiKey = "";
let groqModel = "openai/gpt-oss-20b";
let aiCoachEnabled = false;
let aiRequestInFlight = false;

// --- Trading Diary State ---
let tradeLog = [];        // full history of trades this run: entry + exit details + AI commentary
let openTradeId = null;   // id of the currently open trade in tradeLog, or null

const levels = [
    { name: "Level 1: Calm Market", target: 12000, volatility: 15, speed: 1000 },
    { name: "Level 2: Stormy Market",  target: 16000, volatility: 40, speed: 600 },
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
    if ((fg > 80 || longUptrend) && Math.random() < 0.10) {
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
    const fgWord = fgIdx !== undefined ? fgLabel(fgIdx).replace("_", " ") : "unknown";
    const mode = marketMode.replace("_", " ").toLowerCase();

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
                    Entry $${t.entryPrice.toFixed(2)} · ${fgWordLabel(t.entryFG)} · ${escapeHtml(t.entryMode.replace("_", " "))}
                    ${isOpen ? "" : ` → Exit $${t.exitPrice.toFixed(2)} (${reasonLabel})`}
                </div>
                ${t.entryComment ? `<div class="diaryComment">🤖 On entry: "${escapeHtml(t.entryComment)}"</div>` : ""}
                ${t.exitComment ? `<div class="diaryComment">🤖 On exit: "${escapeHtml(t.exitComment)}"</div>` : ""}
            </div>
        `;
    }).join("");
}

function openTradingDiary() {
    renderTradingDiary();
    showOverlay("tradingDiaryOverlay");
}

function closeDiary() {
    document.getElementById("tradingDiaryOverlay").classList.remove("show");
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
    tradeLog.push({
        id: tradeId,
        level: levels[currentLevel].name,
        entryPrice,
        entryFG: calculateFearGreed(),
        entryMode: marketMode,
        slDist, tpDist,
        exitPrice: null, exitReason: null, profit: null, exitFG: null,
        entryComment: null, exitComment: null
    });
    openTradeId = tradeId;

    requestAICommentary({ type: "BUY", price: entryPrice, slDist, tpDist, fearGreed: calculateFearGreed(), tradeId });
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
    if (closedTradeId !== null) {
        const trade = tradeLog.find(t => t.id === closedTradeId);
        if (trade) {
            trade.exitPrice = currentPrice;
            trade.exitReason = reason;
            trade.profit = profit;
            trade.exitFG = fg;
        }
        openTradeId = null;
    }

    if (reason === "MANUAL") requestAICommentary({ type: "SELL_MANUAL", profit, fearGreed: fg, tradeId: closedTradeId });
    else if (reason === "TP") requestAICommentary({ type: "SELL_TP", profit, fearGreed: fg, tradeId: closedTradeId });
    else if (reason === "SL") requestAICommentary({ type: "SELL_SL", profit, fearGreed: fg, tradeId: closedTradeId });

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
    if (balance <= 0) {
        clearInterval(gameInterval);
        requestAICommentary({ type: "GAME_OVER", balance });
        showOverlay("gameOverOverlay");
    } else if (balance >= levels[currentLevel].target) {
        clearInterval(gameInterval);
        requestAICommentary({ type: "LEVEL_CLEAR", balance, target: levels[currentLevel].target });
        if (currentLevel + 1 < levels.length) {
            document.getElementById('levelClearMsg').innerText =
                `Your balance of $${balance.toFixed(2)} has exceeded the target! Ready to proceed to ${levels[currentLevel+1].name}?`;
            showOverlay("levelClearOverlay");
        } else {
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

loadAISettingsFromSession();
updateAICoachStatusUI();
if (aiCoachEnabled) {
    setAICoachText(groqApiKey
        ? "AI Coach is live. Make your move!"
        : "⚠️ No API key set — using built-in fallback commentary instead of Groq.");
}

loadLevel(0);
