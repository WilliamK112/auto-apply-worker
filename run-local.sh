#!/bin/bash
# Auto-Apply Worker — Local Runner (shows browser, human-in-the-loop)
# Usage: ./run-local.sh
#
# Prerequisites:
#   1. npm install in this directory
#   2. Copy .env.example to .env and fill in your values
#   3. npx playwright install chromium

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
  echo "❌ .env file not found. Copy .env.example to .env and fill in values."
  exit 1
fi

echo "🚀 Starting Auto-Apply Worker (HEADLESS=false — you will see the browser)"
echo ""
echo "📋 How it works:"
echo "   1. Worker opens job page in visible Chrome"
echo "   2. Fills form automatically"
echo "   3. If CAPTCHA appears → pauses and tells you"
echo "   4. You solve it → click Done in the app → worker continues"
echo "   5. Ctrl+C to stop"
echo ""

# Load .env and run
set -a
source .env
set +a

AUTO_APPLY_HEADLESS=false node --require dotenv/config dist/index.js
