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
leaderboard, not an anti-cheat system. See app.py's module docstring for the
full explanation; it applies here unchanged.
"""

import os
import re
from datetime import datetime, timezone

from flask import Flask, jsonify, request

import libsql

MAX_NAME_LENGTH = 20
MAX_LEVEL_LENGTH = 60
MAX_SANE_BALANCE = 10_000_000
ALLOWED_OUTCOMES = {"cleared", "bankrupt", "champion"}
LEADERBOARD_LIMIT = 20

app = Flask(__name__)


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
            created_at TEXT NOT NULL
        )
        """
    )
    con.commit()


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

    con = get_connection()
    ensure_table(con)
    con.execute(
        "INSERT INTO leaderboard (name, balance, level, outcome, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, balance, level, outcome, datetime.now(timezone.utc).isoformat()),
    )
    con.commit()
    return jsonify({"status": "ok"}), 201
