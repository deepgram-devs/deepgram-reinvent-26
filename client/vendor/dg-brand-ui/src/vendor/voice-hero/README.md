# Voice ring (vendored)

The ring-only slice of [deepgram/deepgram-voice-hero](https://github.com/deepgram/deepgram-voice-hero) at
commit `e0f4d41fc3182043fe27b0b8dce3769c554274ee`: `ForegroundRing` (the React ring), `RingElement` (the same
ring as a `<deepgram-voice-ring>` Web Component), and the Three.js glass renderer they share. `VENDOR.json`
lists every file, its hash, and the source commit.

The files are copied verbatim by `npm run sync-voice-hero`, keeping upstream's `components/` and `lib/` layout
so the relative imports work unchanged. Don't edit them here: a test fails if they differ from `VENDOR.json`.
Change the ring upstream, then sync. The kit-sync-voice-ring skill walks through it.

Where the kit uses them:

- `VoiceRing` in `src/voice/Stage.tsx` wraps `ForegroundRing`, and `ConnectedVoiceRing` in `src/pipecat/`
  drives it from a live Pipecat call.
- `src/ring-element/index.ts` registers `<deepgram-voice-ring>`, and `npm run build:ring-element` bundles it
  with Three.js into `assets/ring-element/deepgram-voice-ring.js` for pages without React.
