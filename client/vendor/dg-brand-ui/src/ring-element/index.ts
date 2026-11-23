/**
 * The voice ring as a Web Component, for pages without React: <deepgram-voice-ring>.
 *
 * It's the same ring as VoiceRing (vendored from deepgram/deepgram-voice-hero), drawn with
 * Three.js. Importing this module registers the element. Pages with no build step load the
 * prebuilt classic script instead: assets/ring-element/deepgram-voice-ring.js (npm run
 * build:ring-element), which `npx vdui-assets` copies to public/vdui/ring-element/.
 *
 *   <deepgram-voice-ring state="listening" style="width:16rem;height:16rem"></deepgram-voice-ring>
 *   ring.level = 0.4;                         // 0..1, every frame; a property, not an attribute
 *   ring.setAttribute("state", "speaking");   // listening | thinking | speaking | settling
 *
 * Attributes: state, active (false tears the renderer down), visible (false pauses it), max-size
 * (px, default 560), sky and mid (the palette; leave them for the brand default).
 */
import { defineVoiceRingElement, type VoiceRingElement } from "../vendor/voice-hero/components/RingElement";

export { defineVoiceRingElement, type VoiceRingElement };

defineVoiceRingElement();
