# One image for both halves of the app: the Pipecat bot (Python) and the
# claims UI (Next.js). start.sh runs them side by side in one Fly machine.

# ---- Build the claims UI ----
FROM node:24-bookworm-slim AS client

# next.config.ts reads BOT_URL when the rewrites are built, so set it here too.
# 127.0.0.1, not localhost: the bot binds IPv4 only.
# NEXT_PUBLIC_PIPECAT_TRANSPORT is inlined into the browser bundle: calls go
# through Daily, since Fly won't route a direct WebRTC connection to the bot.
ENV BOT_URL=http://127.0.0.1:7860 \
    NEXT_PUBLIC_PIPECAT_TRANSPORT=daily \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Runtime: Python for the bot, plus the Node binary for the UI ----
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    BOT_URL=http://127.0.0.1:7860 \
    PORT=8080

COPY --from=client /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY agent.py claims.py voices.py start.sh ./
COPY --from=client /app/client ./client

EXPOSE 8080
CMD ["./start.sh"]
