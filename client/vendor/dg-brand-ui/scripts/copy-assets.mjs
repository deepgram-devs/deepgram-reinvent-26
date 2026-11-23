#!/usr/bin/env node
/**
 * Copy the kit's assets (brand.css, the stage and landing textures, partner logos, flags, example photo, the <deepgram-voice-ring> and <deepgram-data-grid> scripts) into an app's public folder.
 *
 *   npx vdui-assets            # → public/vdui
 *   npx vdui-assets static/kit # → static/kit
 *
 * PartnerLogos and languageOptions() look in /vdui by default, and the theme's landing-texture and
 * stage-glow load /vdui/textures. Re-run it after updating the kit.
 */
import { cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const from = resolve(import.meta.dirname, "..", "assets");
const to = resolve(process.cwd(), process.argv[2] ?? "public/vdui");

if (!existsSync(from)) {
  console.error(`No assets at ${from}`);
  process.exit(1);
}
cpSync(from, to, { recursive: true });
for (const dir of ["brand.css", "textures", "logos", "flags", "examples", "ring-element", "data-grid"]) console.log(`✓ ${join(to, dir)}`);
