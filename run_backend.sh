#!/bin/bash
# TemanNetra Backend Launcher
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# 1. Check and release port 8000 if occupied by stale process
PORT=8000
PID=$(lsof -ti :$PORT 2>/dev/null || true)
if [ -n "$PID" ]; then
    echo "⚠️  Port $PORT is already in use by PID(s): $PID"
    echo "Killing stale process on port $PORT..."
    kill -9 $PID 2>/dev/null || true
    sleep 0.5
    echo "✅ Port $PORT released."
fi

# 2. Select Python virtual environment
if [ -f "$DIR/venv/bin/python" ]; then
    PYTHON="$DIR/venv/bin/python"
elif [ -f "$DIR/backend/venv/bin/python" ]; then
    PYTHON="$DIR/backend/venv/bin/python"
else
    PYTHON="python3"
fi

echo "🚀 Starting TemanNetra Backend on http://127.0.0.1:$PORT ..."
exec "$PYTHON" "$DIR/backend/main.py"
