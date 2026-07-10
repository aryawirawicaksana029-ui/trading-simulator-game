# 🎮 Trading Simulator Pro

An educational trading simulator game built with vanilla JavaScript and [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts). Designed with a **"Zero Jargon"** philosophy — teaching real trading concepts (support/resistance, trend, stop loss, market sentiment) through simple visuals that anyone can understand, even without any finance background

🔗 Live demo: https://aryawirawicaksana029-ui.github.io/trading-simulator-game/

## 🌟 Why This Project

Most trading education content is full of jargon (RSI, Fibonacci, Moving Average) that scares beginners away. This game strips that away and teaches the *intuition* behind trading through gameplay: color, shape, and simple language — while still simulating real market behavior patterns underneath.

## 📸 Preview

<img width="1188" height="1054" alt="image" src="https://github.com/user-attachments/assets/cae67098-4064-47c4-b075-a34c68262f4a" />

## 🕹️ Features

- **Live Candlestick Chart** — powered by TradingView's Lightweight Charts library, updating in real time
- **Market Mode Engine** — prices don't move purely randomly. A state machine cycles through realistic patterns:
  - 📈 **Upward Trend** — price climbs with pullbacks
  - 📉 **Downward Trend** — price falls with bounces
  - ↔️ **Floor & Ceiling** (Support & Resistance / Ranging) — price bounces between a floor and ceiling
  - 💥 **Crash** — a sudden 3-candle sell-off, triggered after extended greed/uptrend
- **Fear & Greed Sentiment Meter** — an RSI-inspired index (0–100) calculated from the last 5 candles' net momentum, visualized as a live gauge
- **Risk Management Mechanic** — every BUY requires setting a Stop Loss and Take Profit distance; positions close automatically when price hits either level (drawn directly on the chart)
- **Level Progression** — each level increases volatility and candle speed, raising the difficulty and testing emotional discipline under pressure
- **Win/Lose States** — Game Over screen on bankruptcy, Level Clear screen on reaching the profit target

## 🧠 The "Zero Jargon" Design Philosophy

| Real Trading Concept | In This Game |
|---|---|
| Support & Resistance | "Floor & Ceiling" |
| Uptrend / Downtrend | "Upward Trend / Downward Trend" |
| Market Crash | "Crash" |
| Fear & Greed Index | Simple gauge bar, no numbers required to understand |
| Stop Loss / Take Profit | "Seatbelt" (Safety Belt) — mandatory before every trade |

## 🛠️ Tech Stack

- **HTML5** — structure
- **CSS3** — dark-themed, card-based UI
- **Vanilla JavaScript** — game state, market simulation logic, DOM manipulation
- **[TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)** — professional-grade candlestick rendering (via CDN, no build step needed)

## 📁 Project Structure

```
trading-simulator-game/
├── index.html      # Page structure & markup
├── style.css       # All styling (dark theme, cards, overlays)
├── script.js       # Game state, market engine, trading logic
└── README.md
```

## 🚀 How to Run

No installation needed — it's a static site.

1. Clone this repository
2. Open `index.html` in any modern browser
3. Click **BUY** to enter a position — you'll be asked to set a Stop Loss and Take Profit distance
4. Watch the market move and manage your risk!

## 🎯 How the Market Engine Works

Every "tick" (1 candle), the engine checks:

1. **Is a crash active or about to trigger?** (based on Fear & Greed level + trend duration) → forces 3 red candles
2. **Is the market in Ranging mode?** → bounces price off a calculated ceiling/floor
3. **Is the market Trending?** → biases price movement up or down
4. Every 10–25 candles, the engine re-evaluates the Fear & Greed index and picks the next market mode — simulating how real market phases (accumulation, trend, distribution, crash) tend to cluster rather than switch randomly.

## 👨‍💻 Author

**Arya Wira Wicaksana**
🐍 Python Developer | AI Enthusiast
📧 aryawirawicaksana029@gmail.com
🔗 [GitHub](https://github.com/aryawirawicaksana029-ui)

Built as part of a self-directed 53-day AI Engineering learning journey — combining a background in technical trading analysis with newly learned full-stack skills (Python, JavaScript, and API integration).

## 🔮 Future Plans

- [ ] AI-powered commentary — integrate Groq API to give players real-time feedback on their decisions (e.g. "You bought right as the market hit Extreme Greed — risky!")
- [ ] Trading Diary / Replay — review past decisions after Game Over
- [ ] Interactive Level 0 tutorial with live hints
- [ ] Sound effects for profit/loss events
- [ ] Achievement/badge system (e.g. "Always uses Stop Loss")
- [ ] Additional levels with more complex pattern combinations
- [ ] Mobile-responsive layout
- [ ] Backend (Flask) integration for persistent leaderboards
