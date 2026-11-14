#!/usr/bin/env bash
# Runs both halves of the app in one machine. The bot listens on 127.0.0.1:7860,
# reachable only from inside the machine; the claims UI listens on $PORT, which
# Fly exposes, and passes /api/* through to the bot.
set -euo pipefail

python agent.py -t daily --host 127.0.0.1 --port 7860 &

cd client
node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-8080}" &

# If either process exits, exit too, so Fly restarts the machine
wait -n
exit $?
