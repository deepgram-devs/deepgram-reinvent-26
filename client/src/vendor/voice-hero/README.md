# Voice ring (vendored)

The ring-only slice of [deepgram/deepgram-voice-hero](https://github.com/deepgram/deepgram-voice-hero) at
commit `e0f4d41fc3182043fe27b0b8dce3769c554274ee`: `ForegroundRing` and the Three.js glass renderer it
lazy-loads. These files are copied verbatim, keeping the source's `components/` and `lib/` layout so the
relative imports work unchanged. Edit them upstream and copy them back rather than changing them here.

`ListeningOrb` in `src/components/listening/Listening.tsx` drives the ring from Pipecat. Whose turn it is
comes from `src/hooks/useTurnState.ts` and the audio level from `src/hooks/useVoiceLevelRef.ts`.
