"""
Trading Simulator Pro — Leaderboard API (Vercel serverless function)
=======================================================================
This file becomes the `/api/leaderboard` endpoint automatically once this
project is deployed on Vercel (any Python file placed under `api/` is turned
into its own serverless function, routed by filename).

It talks to a Turso database (hosted, SQLite-compatible via libSQL) instead
of a local SQLite file, because Vercel's serverless functions do NOT have a
persistent local disk — anything written to disk during one request is not
guaranteed to exist on the next invocation. Turso is reached over HTTPS, so
it works perfectly from this stateless environment.

Required environment variables (set these in the Vercel dashboard under
Project Settings -> Environment Variables — never commit them to code):
    TURSO_DATABASE_URL   e.g. libsql://your-db-name-yourorg.turso.io
    TURSO_AUTH_TOKEN     generated with `turso db tokens create your-db-name`

For local development, either:
    (a) run `vercel dev` from the project root (needs the Vercel CLI and the
        same two env vars in a local `.env` file), which emulates this exact
        serverless environment, or
    (b) just use the plain `app.py` at the project root instead — that's a
        traditional Flask + local SQLite server meant for running the game
        on your own machine or a host like PythonAnywhere, no Turso needed.

NOTE ON TRUST: same caveat as the local app.py — this is a hobby-project
leaderboard, not an anti-cheat system, and the per-IP rate limit below can be
bypassed by anyone rotating IPs. See app.py's module docstring for the full
explanation; it applies here unchanged.
"""

import os
import re
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, request

import libsql

MAX_NAME_LENGTH = 20
MAX_LEVEL_LENGTH = 60
MAX_SANE_BALANCE = 10_000_000
ALLOWED_OUTCOMES = {"cleared", "bankrupt", "champion"}
LEADERBOARD_LIMIT = 20
RATE_LIMIT_WINDOW_MINUTES = 10
RATE_LIMIT_MAX_SUBMISSIONS = 5  # per IP, per window

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024  # reject bodies over 10KB outright


def get_connection():
    url = os.environ.get("TURSO_DATABASE_URL")
    token = os.environ.get("TURSO_AUTH_TOKEN")
    if not url or not token:
        raise RuntimeError(
            "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set. "
            "Add them in the Vercel dashboard under Project Settings -> Environment Variables."
        )
    return libsql.connect(url, auth_token=token)


def ensure_table(con):
    con.execute(
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
    con.commit()


def get_client_ip():
    # Vercel's edge network proxies every request, so the real client IP
    # arrives via X-Forwarded-For (the first entry in the list), not the
    # socket-level address. Unlike app.py, trusting this header is correct
    # here specifically because Vercel itself sets it — a client can't spoof
    # what Vercel's own edge writes to that header.
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def is_rate_limited(con, ip_address):
    cur = con.cursor()
    window_start = (datetime.now(timezone.utc) - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)).isoformat()
    row = cur.execute(
        "SELECT COUNT(*) FROM leaderboard WHERE ip_address = ? AND created_at > ?",
        (ip_address, window_start),
    ).fetchone()
    return row[0] >= RATE_LIMIT_MAX_SUBMISSIONS


@app.errorhandler(404)
def handle_404(_e):
    return jsonify({"error": "Not found."}), 404


@app.errorhandler(413)
def handle_413(_e):
    return jsonify({"error": "Request body too large."}), 413


@app.errorhandler(500)
def handle_500(_e):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Something went wrong on the server."}), 500


@app.errorhandler(RuntimeError)
def handle_runtime_error(e):
    # Specifically for the "env vars not configured" case from get_connection()
    # — worth surfacing clearly since it's almost always a setup mistake, not
    # a real production incident.
    return jsonify({"error": str(e)}), 500


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer-when-downgrade"
    return response


@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    con = get_connection()
    ensure_table(con)
    cur = con.cursor()
    rows = cur.execute(
        "SELECT name, balance, level, outcome, created_at "
        "FROM leaderboard ORDER BY balance DESC, created_at ASC LIMIT ?",
        (LEADERBOARD_LIMIT,),
    ).fetchall()
    columns = ["name", "balance", "level", "outcome", "created_at"]
    return jsonify([dict(zip(columns, row)) for row in rows])


@app.route("/api/leaderboard", methods=["POST"])
def post_leaderboard():
    con = get_connection()
    ensure_table(con)
    ip_address = get_client_ip()

    if is_rate_limited(con, ip_address):
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
    if balance != balance or balance in (float("inf"), float("-inf")):
        return jsonify({"error": "Balance must be a finite number."}), 400
    if balance < 0 or balance > MAX_SANE_BALANCE:
        return jsonify({"error": "Balance is outside the accepted range."}), 400

    level = str(data.get("level", "")).strip()[:MAX_LEVEL_LENGTH] or "Unknown Level"

    outcome = str(data.get("outcome", "")).strip()
    if outcome not in ALLOWED_OUTCOMES:
        outcome = "cleared"

    con.execute(
        "INSERT INTO leaderboard (name, balance, level, outcome, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (name, balance, level, outcome, ip_address, datetime.now(timezone.utc).isoformat()),
    )
    con.commit()
    return jsonify({"status": "ok"}), 201
