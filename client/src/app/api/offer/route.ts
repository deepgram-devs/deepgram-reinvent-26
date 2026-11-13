// The browser's WebRTC offer, on its way to the bot.
//
// The small-webrtc transport sends the persona as `requestData`, but the
// Pipecat runner's /api/offer endpoint only reads `request_data` and drops
// the camelCase field, so every call would start as a policyholder. This
// handler renames it and passes everything else through untouched. Next
// serves this route before the /api rewrite in next.config.ts, which still
// carries the bot's other endpoints.

// Where the Pipecat runner listens: `python agent.py` serves on port 7860.
const BOT_URL = process.env.BOT_URL ?? "http://localhost:7860";

async function forward(request: Request, body: string): Promise<Response> {
  const { search } = new URL(request.url);
  const response = await fetch(`${BOT_URL}/api/offer${search}`, {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    body,
  });
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}

/** The offer, with requestData renamed to the request_data the runner reads */
export async function POST(request: Request): Promise<Response> {
  const offer = await request.json();
  if (offer && typeof offer === "object" && "requestData" in offer && !("request_data" in offer)) {
    const { requestData, ...rest } = offer;
    return forward(request, JSON.stringify({ ...rest, request_data: requestData }));
  }
  return forward(request, JSON.stringify(offer));
}

/** ICE candidates, sent to the same endpoint as they're found */
export async function PATCH(request: Request): Promise<Response> {
  return forward(request, await request.text());
}
