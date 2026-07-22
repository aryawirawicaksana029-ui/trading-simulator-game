"""
Trading Simulator Pro — Leaderboard Backend
=============================================
A small Flask server that:
  1. Serves the existing static game files (index.html, style.css, script.js)
     from this same folder, so the game + leaderboard work together from one
     address — no separate frontend build step, no CORS to configure.
  2. Provides a tiny REST API backed by SQLite so high scores persist across
     restarts, browsers, and players.

Run it with:
    pip install -r requirements.txt
    python app.py

Then open:  http://127.0.0.1:5000

The game still works perfectly if you just open index.html directly as a
file — the frontend detects whether this backend is reachable and quietly
disables the Leaderboard button (with a friendly note) if it isn't. Every
other feature (AI Coach, Trading Diary, Achievements, Tutorial, Sound) is
pure client-side and does not depend on this server at all.

NOTE ON TRUST: this is a hobby-project leaderboard, not an anti-cheat system.
Scores are submitted directly from the browser with no login or signature, so
anyone who can reach the API can POST a fake score with a plain HTTP request
(e.g. curl). Basic sanity checks are applied below (name length, a finite
balance within a generous upper bound) purely to keep obviously broken data
out of the table — this does NOT verify a score was actually earned by
playing the game. That's fine for friends comparing high scores; it is not
suitable as-is for a public, competitive leaderboard without adding real
authentication and server-side game-state verification.
"""

import os
import re
import sqlite3
from datetime import datetime, timezone

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "leaderboard.db")

MAX_NAME_LENGTH = 20
MAX_LEVEL_LENGTH = 60
MAX_SANE_BALANCE = 10_000_000  # generous upper bound, just to catch garbage/typo'd input
ALLOWED_OUTCOMES = {"cleared", "bankrupt", "champion"}
LEADERBOARD_LIMIT = 20

# static_folder="." + static_url_path="" lets Flask serve style.css/script.js
# straight out of the project root, exactly where they already live.
app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")


# ---------------------------------------------------------------- database
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS leaderboard (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            balance    REAL NOT NULL,
            level      TEXT NOT NULL,
            outcome    TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


# ------------------------------------------------------------------ routes
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    db = get_db()
    rows = db.execute(
        "SELECT name, balance, level, outcome, created_at "
        "FROM leaderboard ORDER BY balance DESC, created_at ASC LIMIT ?",
        (LEADERBOARD_LIMIT,),
    ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.route("/api/leaderboard", methods=["POST"])
def post_leaderboard():
    data = request.get_json(silent=True) or {}

    name = re.sub(r"\s+", " ", str(data.get("name", "")).strip())[:MAX_NAME_LENGTH]
    if not name:
        return jsonify({"error": "Name is required."}), 400

    balance = data.get("balance")
    try:
        balance = float(balance)
    except (TypeError, ValueError):
        return jsonify({"error": "Balance must be a number."}), 400
    if balance != balance or balance in (float("inf"), float("-inf")):  # NaN / Infinity check
        return jsonify({"error": "Balance must be a finite number."}), 400
    if balance < 0 or balance > MAX_SANE_BALANCE:
        return jsonify({"error": "Balance is outside the accepted range."}), 400

    level = str(data.get("level", "")).strip()[:MAX_LEVEL_LENGTH] or "Unknown Level"

    outcome = str(data.get("outcome", "")).strip()
    if outcome not in ALLOWED_OUTCOMES:
        outcome = "cleared"

    db = get_db()
    db.execute(
        "INSERT INTO leaderboard (name, balance, level, outcome, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, balance, level, outcome, datetime.now(timezone.utc).isoformat()),
    )
    db.commit()
    return jsonify({"status": "ok"}), 201


if __name__ == "__main__":
    init_db()
    # host=127.0.0.1 keeps this reachable only from your own machine by
    # default. Change to "0.0.0.0" only if you deliberately want it reachable
    # from other devices on your network.
    #
    # debug defaults to OFF: Flask's debugger lets anyone who can reach it run
    # arbitrary code on your machine if an error occurs. Only turn it on for
    # local development you control: FLASK_DEBUG=1 python app.py
    debug_mode = os.environ.get("FLASK_DEBUG") == "1"
    app.run(host="127.0.0.1", port=5000, debug=debug_mode)
