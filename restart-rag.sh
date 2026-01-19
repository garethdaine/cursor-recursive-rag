#!/bin/bash
set -e

echo "🛑 Stopping running RAG instances..."
pkill -f "node dist/cli/index.js dashboard" || echo "   No running instances found"

echo "🔨 Building project..."
npm run build

echo "🚀 Starting RAG dashboard..."
nohup node dist/cli/index.js dashboard > /dev/null 2>&1 &

sleep 2

echo "✅ Done! Dashboard running at http://localhost:3333/"
echo "   PID: $(pgrep -f "node dist/cli/index.js dashboard")"
