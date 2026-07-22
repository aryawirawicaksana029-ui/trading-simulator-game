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
- **Flask + SQLite** *(optional, for local/self-hosted use)* — a tiny backend that persists the Leaderboard across sessions and players. Fully optional: every other feature works with zero backend, as a plain static site.
- **Flask + Turso** *(optional, for deploying on Vercel)* — the same Leaderboard API, adapted to run as a Vercel serverless function backed by [Turso](https://turso.tech) (a hosted, SQLite-compatible database), since Vercel's functions don't have a persistent local disk.

## 📁 Project Structure

```
trading-simulator-game/
├── index.html          # Page structure & markup
├── style.css           # All styling (dark theme, cards, overlays)
├── script.js           # Game state, market engine, trading logic (talks to /api/leaderboard either way)
├── app.py              # Flask + local SQLite backend — for running on your own machine or PythonAnywhere
├── api/
│   └── leaderboard.py  # Flask + Turso backend — becomes /api/leaderboard automatically when deployed on Vercel
├── requirements.txt    # Python deps for either backend (Flask, libsql)
├── .env.example        # Documents the two env vars api/leaderboard.py needs (copy to .env, never commit the real one)
├── .gitignore           # Keeps leaderboard.db, .env, and __pycache__ out of version control
├── leaderboard.db       # Created automatically the first time app.py runs (SQLite) — not checked in
└── README.md
```

Only one of the two backends is "active" per deployment: run `app.py` yourself → it uses local SQLite. Deploy the whole folder to Vercel → `api/leaderboard.py` takes over automatically and talks to Turso instead. `script.js` doesn't know or care which one is answering — both expose the exact same `/api/leaderboard` contract.

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
| `POST` | `/api/leaderboard` | `{ "name": "...", "balance": 12345.67, "level": "...", "outcome": "cleared" \| "bankrupt" \| "champion" }` | Adds one entry. `name` is trimmed to 20 characters; `balance` must be a finite number between 0 and 10,000,000. Returns `429` if the same IP has submitted 5+ times in the last 10 minutes. |

⚠️ **Trust note:** this is a hobby-project leaderboard, not an anti-cheat system — anyone who can reach the API can `POST` a fake score directly (no login, no signature). The server only does basic sanity-checking on the data shape, not verification that a score was actually earned in-game. Fine for friends comparing runs; not something to expose publicly as a competitive leaderboard without adding real auth.

### Option C — Deploy publicly on Vercel + Turso

This is the path to a real, shareable URL instead of `127.0.0.1`. Vercel is excellent for the static frontend, but its Python functions have **no persistent disk** — a local SQLite file would get wiped on every cold start. [Turso](https://turso.tech) solves this: it's SQLite-compatible but hosted, reachable over HTTPS, so it survives serverless restarts. That's what `api/leaderboard.py` is built for.

**1. Create the Turso database** (free tier, no credit card needed):
```bash
curl -sSfL https://get.tur.so/install.sh | bash   # installs the Turso CLI
turso auth signup                                  # or `turso auth login` if you already have an account
turso db create trading-simulator-leaderboard
turso db show trading-simulator-leaderboard        # copy the "URL" (starts with libsql://)
turso db tokens create trading-simulator-leaderboard  # copy this token — shown only once
```

**2. Deploy to Vercel:**
- Push this repo to GitHub, then [import it on vercel.com](https://vercel.com/new) — Vercel auto-detects `index.html` as a static site and `api/leaderboard.py` as a serverless function, no build config needed
- Or via CLI: `npm i -g vercel && vercel` from the project root
- Either way, before (or right after) the first deploy, add two environment variables in **Project Settings → Environment Variables**:

| Key | Value |
|---|---|
| `TURSO_DATABASE_URL` | the `libsql://...` URL from step 1 |
| `TURSO_AUTH_TOKEN` | the token from step 1 |

- Redeploy after adding the env vars (Vercel only reads them at build/deploy time)

**3. Open your `*.vercel.app` URL** — the game loads as a static site, and the **🏆 Leaderboard** button now talks to `/api/leaderboard`, which Vercel routes to `api/leaderboard.py`, which reads/writes your Turso database.

**Local testing against the same setup** (recommended before deploying): copy `.env.example` to `.env` and fill in the same two values, then run `vercel dev` from the project root — it emulates the exact serverless environment Vercel uses in production, including routing `/api/leaderboard` to `api/leaderboard.py`.

> **Honesty note:** this Vercel + Turso path was built and logic-tested locally (Flask route validation, sorting, error handling all verified against a stand-in database), but the actual Turso connection and Vercel's routing of `api/*.py` files could not be tested end-to-end in this environment — no live Turso account or Vercel deployment was available. The code follows the current official APIs for both platforms as closely as possible, but if something doesn't route correctly on your first deploy, check the **Vercel dashboard → your project → Functions** tab (build/runtime logs will show if `api/leaderboard.py` failed to build or crashed) and Vercel's [current Python runtime docs](https://vercel.com/docs/functions/runtimes/python).

## 🔒 Security

Both backends (`app.py` and `api/leaderboard.py`) share the same hardening, since they share the same trust model — a leaderboard anyone can submit to with no login:

- **Per-IP rate limiting** — max 5 submissions per IP per 10 minutes, checked against the database itself (not in-memory) so it works correctly even across Vercel's serverless cold starts. `app.py` trusts the raw connection IP (`request.remote_addr`); `api/leaderboard.py` trusts `X-Forwarded-For` instead, because Vercel's edge network proxies every request and writes the real client IP there — trusting that header is only safe because Vercel itself sets it, not the client.
- **Request size cap** — bodies over 10KB are rejected outright (`413`) before they're even parsed, so no one can send an enormous payload just to waste CPU/bandwidth.
- **All errors return clean JSON** — 404, 413, 500, and the "Turso isn't configured yet" case all return a small `{"error": "..."}` body instead of an HTML error page or a raw stack trace. Real error details still go to the server log, never to the client.
- **`debug=False` by default** in `app.py` — Flask's interactive debugger lets anyone who can reach it execute arbitrary code on your machine if it's ever left on somewhere reachable. Opt in explicitly with `FLASK_DEBUG=1` only for local development you control.
- **Basic security headers** on every response — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer-when-downgrade`.
- **Parameterized SQL everywhere** — every query uses `?` placeholders, never string-formatted SQL, so user input can't break out of a query (SQL injection).
- **XSS-safe rendering** — leaderboard names are escaped client-side (`escapeHtml()` in `script.js`) before being inserted into the page, so a name like `<script>...</script>` just displays as literal text instead of running.
- **No server-side secrets in the frontend** — the Groq API key for the AI Coach is entered and used entirely in the browser; it's never sent to or stored by either backend.
- **HTTPS** — free and automatic on Vercel; if self-hosting `app.py` publicly instead, put it behind a reverse proxy (nginx, Caddy) that terminates TLS, since Flask's dev server doesn't do HTTPS itself.

**What this does *not* protect against**, so you go in with eyes open:
- The rate limit is per-IP and can be bypassed by anyone rotating IPs (VPN, proxy). It raises the bar for casual spam; it doesn't stop a determined attacker.
- There's still no authentication — anyone who finds your `/api/leaderboard` URL can submit a score directly with `curl`, bypassing the game entirely. Fine for a leaderboard among friends; not appropriate for a public competitive leaderboard without adding real auth and server-side verification that a score was actually earned.
- Flask's built-in dev server (used by `app.py`) is not meant for production traffic even with debug off — for anything beyond casual/personal use, put a real WSGI server (gunicorn, waitress) in front of it, which is exactly what PythonAnywhere and most PaaS hosts already do for you automatically.

## 🎨 Design System

The UI was redesigned around a **"trading terminal" identity** — leaning into the visual heritage of real trading terminals (amber-on-void, monospace chrome) while keeping the game's Zero Jargon voice underneath: a serious-looking instrument that talks to you in plain words.

- **Palette** — a near-black void (`#0a0d0a`) with dark green-tinted panels, one warm amber accent (`#ffb627`) for all UI chrome (headers, secondary buttons, focus states, tutorial/achievement highlights), and green/red (`#3ddc84` / `#ff4d5e`) reserved specifically for buy-sell and profit-loss — matching the color convention real trading platforms use, so it doubles as reinforcement for what those colors mean.
- **Type** — [JetBrains Mono](https://www.jetbrains.com/lp/mono/) for headers, buttons, and every number on screen (that "ticking terminal" feel, with tabular figures so digits align), paired with [Inter](https://rsms.me/inter/) for longer text (tutorial steps, AI Coach commentary, diary entries) where a humanist sans reads easier over a few sentences.
- **Signature motif** — HUD-style corner brackets on the chart, the one place the design spends its "boldness" per the classic advice to pick one memorable element and keep everything else quiet.
- **Motion, used with restraint** — each animation is tied to something happening, not ambient decoration: the balance ticks up/down instead of snapping to its new value, overlays fade and their content card scales in, a small confetti burst marks Level Clear and the final win. Everything respects `prefers-reduced-motion` and is skipped entirely for anyone with that OS setting on.
- **Accessibility floor** — visible focus rings (`:focus-visible`) on every button/input/select, and all of the above.

## 💡 Ideas for Further Polish

Not yet implemented, but worth considering if you keep building on this:
- **Daily Challenge mode** — same market seed for every player on a given day, so the Leaderboard becomes a fair, direct comparison
- **PWA support** — installable + offline-capable, since the game is already almost entirely static
- **Bahasa Indonesia localization**
- **Export Trading Diary** to CSV

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
