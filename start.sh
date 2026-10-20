#!/usr/bin/env bash
# Starts both the RestaurantGPT FastAPI backend and Vite frontend dev server locally.
# Press Ctrl+C in this terminal to stop both servers.

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

cleanup() {
  echo ""
  echo "Shutting down RestaurantGPT local servers..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM EXIT

echo "======================================================"
echo " Starting RestaurantGPT Local Preview (Phase 2)"
echo "======================================================"

# 1. Start backend in background
echo "-> Starting Backend API (FastAPI) on http://127.0.0.1:8000..."
(cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) &
BACKEND_PID=$!

# Brief pause to let backend bind port
sleep 1

# 2. Start frontend in foreground
echo "-> Starting Frontend (Vite) on http://localhost:5173..."
echo "-> Access the app at: http://localhost:5173"
echo "======================================================"
(cd frontend && npm run dev -- --host 127.0.0.1 --port 5173) &
FRONTEND_PID=$!

wait $FRONTEND_PID $BACKEND_PID
