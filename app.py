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
(e.g. curl). Basic sanity checks and a simple per-IP rate limit are applied
below purely to keep obviously broken or spammy data out of the table — this
does NOT verify a score was actually earned by playing the game, and the rate
limit can be bypassed by anyone rotating IPs (a VPN, etc). That's fine for
friends comparing high scores; it is not suitable as-is for a public,
competitive leaderboard without adding real authentication and server-side
game-state verification.
"""

import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "leaderboard.db")

MAX_NAME_LENGTH = 20
MAX_LEVEL_LENGTH = 60
MAX_SANE_BALANCE = 10_000_000  # generous upper bound, just to catch garbage/typo'd input
ALLOWED_OUTCOMES = {"cleared", "bankrupt", "champion"}
LEADERBOARD_LIMIT = 20
RATE_LIMIT_WINDOW_MINUTES = 10
RATE_LIMIT_MAX_SUBMISSIONS = 5  # per IP, per window

# static_folder="." + static_url_path="" lets Flask serve style.css/script.js
# straight out of the project root, exactly where they already live.
app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")

# Reject request bodies over 10KB outright — a leaderboard entry is a few
# dozen bytes, so anything bigger is either a mistake or abuse.
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024


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
            ip_address TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    # Defensive migration for databases created before the ip_address column
    # existed — harmless no-op if the column is already there.
    try:
        conn.execute("ALTER TABLE leaderboard ADD COLUMN ip_address TEXT")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()


def get_client_ip():
    # This server isn't expected to run behind a reverse proxy by default, so
    # remote_addr (the actual TCP connection's IP) is trusted over any
    # client-suppliable header. If you do put this behind nginx/a proxy,
    # configure Flask's ProxyFix middleware instead of trusting headers here.
    return request.remote_addr or "unknown"


def is_rate_limited(db, ip_address):
    window_start = (datetime.now(timezone.utc) - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)).isoformat()
    row = db.execute(
        "SELECT COUNT(*) AS c FROM leaderboard WHERE ip_address = ? AND created_at > ?",
        (ip_address, window_start),
    ).fetchone()
    return row["c"] >= RATE_LIMIT_MAX_SUBMISSIONS


# ------------------------------------------------------------- error shape
@app.errorhandler(404)
def handle_404(_e):
    return jsonify({"error": "Not found."}), 404


@app.errorhandler(413)
def handle_413(_e):
    return jsonify({"error": "Request body too large."}), 413


@app.errorhandler(500)
def handle_500(_e):
    # Never leak stack traces / internal paths to the client, even if DEBUG
    # is accidentally left on. Real details still go to the server log.
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Something went wrong on the server."}), 500


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer-when-downgrade"
    return response


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
    db = get_db()
    ip_address = get_client_ip()

    if is_rate_limited(db, ip_address):
        return jsonify({"error": "Too many submissions — please wait a few minutes and try again."}), 429

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

    db.execute(
        "INSERT INTO leaderboard (name, balance, level, outcome, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (name, balance, level, outcome, ip_address, datetime.now(timezone.utc).isoformat()),
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
