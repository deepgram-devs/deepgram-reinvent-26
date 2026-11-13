"use client";

import { usePipecatClientMediaTrack } from "@pipecat-ai/client-react";
import { useEffect, useRef, type RefObject } from "react";

// The voice hero's display curve (lib/audio.ts there): ordinary speech sits near the bottom of a raw RMS
// meter, so RMS × 4 is stretched from this floor to this ceiling across the ring's 0..1.
const FLOOR = 0.015;
const CEILING = 0.3;
const normalize = (rms: number) => Math.max(0, Math.min(1, (rms * 4 - FLOOR) / (CEILING - FLOOR)));

/**
 * The louder of the caller and the agent, 0 to 1, measured from both audio tracks every frame and kept in
 * a ref so the voice ring can sample it without re-rendering React. Reads 0 while `silenced`.
 *
 * Measured here rather than taken from Pipecat's RTVI level events: the SmallWebRTC transport never emits
 * RemoteAudioLevel (it builds its media manager without the player that meters the bot), and the local
 * event only arrives every 100 ms.
 */
export function useVoiceLevelRef(silenced = false): RefObject<number> {
  const level = useRef(0);
  const mic = usePipecatClientMediaTrack("audio", "local");
  const bot = usePipecatClientMediaTrack("audio", "bot");

  useEffect(() => {
    level.current = 0;
    const tracks = [mic, bot].filter((track): track is MediaStreamTrack => track !== null);
    if (silenced || !tracks.length) return;

    const context = new AudioContext();
    const meters = tracks.map((track) => {
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
      return { track, analyser, samples: new Float32Array(analyser.fftSize) };
    });
    // Created after the caller pressed Start, so the browser lets it run; resume in case it began suspended.
    context.resume().catch(() => {});

    let frame = 0;
    const sample = () => {
      let loudest = 0;
      for (const { track, analyser, samples } of meters) {
        // A muted mic is disabled, not removed; it must not move the ring.
        if (!track.enabled || track.readyState !== "live") continue;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += s * s;
        loudest = Math.max(loudest, Math.sqrt(sum / samples.length));
      }
      level.current = normalize(loudest);
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);

    return () => {
      cancelAnimationFrame(frame);
      level.current = 0;
      context.close().catch(() => {});
    };
  }, [mic, bot, silenced]);

  return level;
}
