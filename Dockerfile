# syntax=docker/dockerfile:1

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
COPY client/package.json client/package-lock.json client/.npmrc ./
# The UI kit is vendored in the repo and installed from this folder
COPY client/vendor ./vendor
RUN npm ci
COPY client/ ./
# Perfektta, the brand's headline face, is licensed, so it never goes in the repo. The Fly deploy
# passes a private URL for it as the display_font_url build secret, and the build serves it from
# /fonts/. Without the secret (local builds, forks), or if the download fails, headlines stay
# Work Sans and the build goes on.
RUN --mount=type=secret,id=display_font_url \
    if [ -s /run/secrets/display_font_url ]; then \
      if node -e ' \
        const [url, out] = process.argv.slice(1); \
        fetch(url).then(async (res) => { \
          if (!res.ok) throw new Error(`HTTP ${res.status}`); \
          const font = Buffer.from(await res.arrayBuffer()); \
          if (font.subarray(0, 4).toString() !== "wOF2") throw new Error("not a woff2 file"); \
          require("fs").mkdirSync("public/fonts", { recursive: true }); \
          require("fs").writeFileSync(out, font); \
        }).catch((err) => { console.error(`Perfektta download failed: ${err.message}`); process.exit(1); }); \
      ' "$(cat /run/secrets/display_font_url)" public/fonts/perfektta-semibold.woff2; then \
        export NEXT_PUBLIC_DISPLAY_FONT=/fonts/perfektta-semibold.woff2; \
        echo "Headlines use Perfektta"; \
      else \
        echo "WARNING: headlines fall back to Work Sans"; \
      fi; \
    fi; \
    npm run build

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
