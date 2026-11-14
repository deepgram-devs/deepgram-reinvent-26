import type { NextConfig } from "next";

// Where the Pipecat runner listens: `python agent.py` serves on port 7860.
const BOT_URL = process.env.BOT_URL ?? "http://localhost:7860";

const nextConfig: NextConfig = {
  // The browser posts its WebRTC offer to /api/offer on this app, and Next
  // passes it to the bot, so there's no CORS setup and no second origin.
  // The runner serves /start at its root, not under /api, so it gets its own
  // rewrite, listed first because rewrites are tried in order.
  async rewrites() {
    return [
      { source: "/api/start", destination: `${BOT_URL}/start` },
      { source: "/api/:path*", destination: `${BOT_URL}/api/:path*` },
    ];
  },
};

export default nextConfig;
