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
}

function sell(auto = false) {
    if (position !== "LONG") {
        if (!auto) alert("You do not have any open position to sell!");
        return;
    }
    let profit = currentPrice - entryPrice;
    balance += profit;
    document.getElementById('balanceText').innerText = balance.toFixed(2);
    document.getElementById('positionText').innerText = "None";
    position = null;

    if (slLine) { candleSeries.removePriceLine(slLine); slLine = null; }
    if (tpLine) { candleSeries.removePriceLine(tpLine); tpLine = null; }

    if (!auto) alert(`Profit/Loss: $${profit.toFixed(2)}`);
    checkWinLose();
}

function checkAutomation() {
    if (position === "LONG") {
        if (currentPrice <= slPrice) {
            alert(`💥 STOP LOSS triggered! The system automatically closed your position at $${currentPrice.toFixed(2)}.`);
            sell(true);
        } else if (currentPrice >= tpPrice) {
            alert(`🎉 TAKE PROFIT triggered! The system automatically secured your profit at $${currentPrice.toFixed(2)}.`);
            sell(true);
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
        showOverlay("gameOverOverlay");
    } else if (balance >= levels[currentLevel].target) {
        clearInterval(gameInterval);
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
document.getElementById("sellBtn").addEventListener("click", sell);

loadLevel(0);
