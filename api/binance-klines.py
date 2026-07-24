"""
Trading Simulator Pro — Binance Klines Proxy (Vercel serverless function)
============================================================================
Becomes `/api/binance-klines` automatically when deployed on Vercel. Relays
Binance's public klines (candlestick) endpoint server-side, used to backfill
the chart with real historical candles when "🔴 Live BTC" mode starts.

Live updates after that backfill come from a WebSocket the browser opens
directly to Binance (wss://stream.binance.com) — CORS doesn't apply to
WebSocket connections, so that part needs no proxy. This endpoint exists
specifically for the one-time REST history fetch, since Binance's REST API's
CORS support for direct browser requests is inconsistent — proxying
server-side sidesteps the question entirely.
"""

import json
import urllib.request
import urllib.error

from flask import Flask, jsonify, request

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"
ALLOWED_SYMBOLS = {"BTCUSDT", "ETHUSDT", "BNBUSDT"}
ALLOWED_INTERVALS = {"1m", "3m", "5m", "15m", "1h"}

app = Flask(__name__)


@app.errorhandler(404)
def handle_404(_e):
    return jsonify({"error": "Not found."}), 404


@app.errorhandler(500)
def handle_500(_e):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Something went wrong on the server."}), 500


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer-when-downgrade"
    return response


@app.route("/api/binance-klines", methods=["GET"])
def get_binance_klines():
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    interval = request.args.get("interval", "1m")

    if symbol not in ALLOWED_SYMBOLS:
        return jsonify({"error": "Unsupported symbol."}), 400
    if interval not in ALLOWED_INTERVALS:
        return jsonify({"error": "Unsupported interval."}), 400

    try:
        limit = max(1, min(int(request.args.get("limit", "100")), 500))
    except ValueError:
        limit = 100

    url = f"{BINANCE_KLINES_URL}?symbol={symbol}&interval={interval}&limit={limit}"
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        return jsonify({"error": f"Could not reach Binance: {e}"}), 502
    except Exception:
        app.logger.exception("Binance klines proxy failed")
        return jsonify({"error": "Failed to fetch or parse data from Binance."}), 502

    candles = [
        {
            "time": int(row[0] // 1000),
            "open": float(row[1]),
            "high": float(row[2]),
            "low": float(row[3]),
            "close": float(row[4]),
        }
        for row in raw
    ]
    return jsonify(candles)
