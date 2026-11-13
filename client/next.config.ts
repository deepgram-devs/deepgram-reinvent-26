import type { NextConfig } from "next";

// Where the Pipecat runner listens: `python agent.py` serves on port 7860.
const BOT_URL = process.env.BOT_URL ?? "http://localhost:7860";

const nextConfig: NextConfig = {
  // The browser posts its WebRTC offer to /api/offer on this app, and Next
  // passes it to the bot, so there's no CORS setup and no second origin.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BOT_URL}/api/:path*` }];
  },
};

export default nextConfig;
