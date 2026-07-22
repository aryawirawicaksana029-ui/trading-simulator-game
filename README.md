# 🎮 Trading Simulator Pro

An educational trading simulator game built with vanilla JavaScript and [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts). Designed with a **"Zero Jargon"** philosophy — teaching real trading concepts (support/resistance, trend, stop loss, market sentiment) through simple visuals that anyone can understand, even without any finance background.

## 🌟 Why This Project

Most trading education content is full of jargon (RSI, Fibonacci, Moving Average) that scares beginners away. This game strips that away and teaches the *intuition* behind trading through gameplay: color, shape, and simple language — while still simulating real market behavior patterns underneath.

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
- **Persistent Leaderboard** *(optional, needs the Flask backend)* — submit your best run and see how you rank against other players

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
- **Flask + SQLite** *(optional)* — a tiny backend that persists the Leaderboard across sessions and players. Fully optional: every other feature works with zero backend, as a plain static site.

## 📁 Project Structure

```
trading-simulator-game/
├── index.html          # Page structure & markup
├── style.css           # All styling (dark theme, cards, overlays)
├── script.js           # Game state, market engine, trading logic
├── app.py              # Optional Flask backend (serves the game + the Leaderboard API)
├── requirements.txt    # Python dependency for app.py (just Flask)
├── leaderboard.db       # Created automatically the first time app.py runs (SQLite) — not checked in
└── README.md
```

## 🚀 How to Run

### Option A — Just the game (no installation needed)

It's a static site — every feature works this way except the persistent Leaderboard.

1. Clone this repository
2. Open `index.html` in any modern browser
3. Click **BUY** to enter a position — you'll be asked to set a Stop Loss and Take Profit distance
4. Watch the market move and manage your risk!

### Option B — Game + persistent Leaderboard (Flask backend)

Adds a **🏆 Leaderboard** you and friends can submit high scores to, saved in a local SQLite database that survives restarts.

1. (Recommended) create a virtual environment: `python -m venv venv && source venv/bin/activate` (Windows: `venv\Scripts\activate`)
2. Install the one dependency: `pip install -r requirements.txt`
3. Run the server: `python app.py`
4. Open **http://127.0.0.1:5000** in your browser (not `index.html` directly this time — the server serves it for you)

That's it — `leaderboard.db` is created automatically on first run. If you ever open `index.html` directly instead of going through the server, the game still works completely normally; the **🏆 Leaderboard** button just shows a friendly "server not detected" message instead of breaking anything.

**API reference**, if you want to build your own frontend against it or just poke it with `curl`:

| Method | Endpoint | Body | Notes |
|---|---|---|---|
| `GET` | `/api/leaderboard` | — | Returns the top 20 scores as JSON, sorted highest balance first |
| `POST` | `/api/leaderboard` | `{ "name": "...", "balance": 12345.67, "level": "...", "outcome": "cleared" \| "bankrupt" \| "champion" }` | Adds one entry. `name` is trimmed to 20 characters; `balance` must be a finite number between 0 and 10,000,000 |

⚠️ **Trust note:** this is a hobby-project leaderboard, not an anti-cheat system — anyone who can reach the API can `POST` a fake score directly (no login, no signature). The server only does basic sanity-checking on the data shape, not verification that a score was actually earned in-game. Fine for friends comparing runs; not something to expose publicly as a competitive leaderboard without adding real auth.

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

- [x] AI-powered commentary — integrated Groq API (`⚙️ AI Coach` button in-game) to give players real-time feedback on their decisions (e.g. "You bought right as the market hit Extreme Greed — risky!"). Get a free key at [console.groq.com](https://console.groq.com), paste it into the AI Coach settings, and enable it. Without a key, the game still shows built-in fallback commentary so the feature always works. **Note:** since this is a static no-backend site, the key lives only in your browser tab (memory, or `sessionStorage` if you opt in) and is sent directly to Groq — don't hardcode your own key into the source before sharing/deploying this project; wire it through the planned Flask backend instead if you ever make this public.
- [x] Trading Diary / Replay — every BUY/SELL is logged (entry & exit price, Fear/Greed at the time, P/L, and the AI Coach's comment if enabled). Click **📔 Diary** anytime, or use the same button on the Game Over / Level Clear / Win screens, to review the full history with win-rate and net P/L stats.
- [x] Interactive Level 0 tutorial with live hints — a 10-step guided walkthrough (**🎓 Tutorial** button, also shown on first launch) that highlights each real UI element (chart, Fear/Greed meter, BUY/SELL, AI Coach, Diary) with a floating hint box. Some steps just need "Next", others wait for you to actually perform the action (open a real BUY, then close it) before advancing — no risk to your balance while it's active, and it always hands off into a clean Level 1 run when finished or skipped.
- [x] Sound effects for profit/loss events — synthesized with the Web Audio API (no audio files needed): a soft click on BUY, a bright chime on profit, a gentle dip on loss, a celebratory arpeggio when Take Profit triggers, a duller thud when Stop Loss saves you, plus a fanfare on Level Clear and a low tone on Game Over. Toggle anytime with the **🔊 Sound** button — the preference is remembered across visits.
- [x] Achievement/badge system (e.g. "Always uses Stop Loss") — 14 badges across milestones (First Trade, Level 1 Cleared, Trading Champion), risk-discipline (Always Buckled Up, Seatbelt Saved Me, Sniper), boldness (Contrarian, Rode the Wave), streaks (Hot Streak), resilience (Comeback Kid), and feature exploration (AI Believer, Diary Keeper, Graduate, Big Balance). Unlocks show a toast notification + a chime, and progress is saved across visits. Click **🏅 Achievements** anytime to see the full list, locked and unlocked.
- [x] Additional levels with more complex pattern combinations — 3 new levels (Level 3: Choppy Waters, Level 4: Bull & Bear Traps, Level 5: Black Swan) on top of the original two, each unlocking new market patterns that layer on top of the existing Trend/Floor & Ceiling/Crash engine: **🌊 Whipsaw** (violent, directionless chop), **🪤 Fake Breakout** (price fakes a breakout past the Ceiling/Floor to lure a trade, then snaps back hard the other way), and **💥🚀 Flash Crash + V-Recovery** (a sharp crash immediately followed by a sharp bounce). Level 5 also has a higher spontaneous-crash chance for extra chaos. Verified with a 15,000-candle simulation across all 5 levels with no numerical issues.
- [x] Mobile-responsive layout — proper viewport meta tag, the chart resizes to fit its container (and re-fits on orientation change/window resize), the Fear & Greed label row no longer relies on a fixed-width `&nbsp;` hack, the button row wraps cleanly with a flexbox, and all overlays/panels (Diary, Achievements, AI Settings, Tutorial tooltip, achievement toasts) reflow properly down to ~320px-wide screens. Verified with real headless-browser screenshots at 320px, 375px, 768px, and 1024px.
- [x] Backend (Flask) integration for persistent leaderboards — a small optional Flask + SQLite server (`app.py`) that serves the whole game and adds a `/api/leaderboard` REST API. Submit your **peak balance** on Game Over or your final balance on winning, then browse the **🏆 Leaderboard** panel to see the top 20 runs. Fully backward-compatible: the frontend probes for the backend on load and gracefully disables the Leaderboard UI (with a helpful message) if it isn't running — every other feature keeps working as a plain static site either way. Tested end-to-end with a real headless browser, including score submission, input validation, and the no-backend fallback path.
