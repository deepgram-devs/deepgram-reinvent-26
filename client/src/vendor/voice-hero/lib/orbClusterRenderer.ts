// The orb lattice, drawn: 32 glass beads over the aura, in WebGL through
// three.js. lib/lattice.ts decides where every bead is and how much its
// surface is disturbed; this file only paints those poses.
//
// Three instanced meshes, one per bead shape (rounded squares, pills, spheres), share
// one glass shader. Two-triangle billboards reconstruct their curved surfaces per
// fragment. The fragment stage is frosted glass: it
// REFRACTS the aura and BLURS what sits behind each bead. The aura is a 2D canvas
// in the DOM underneath this one, not part of the scene, so changed paints are
// copied to a bounded texture at at most 10 Hz and sampled at the
// fragment's screen position — offset by the refracted view vector, then averaged
// over a small disc so the background reads as seen through frost. Both canvases
// cover the whole hero, so the texture's UV space is the screen.
//
// A clear centre, softly frosted body and thin tinted rim suggest cast glass. The
// lattice's fill envelope lets the frost develop after the rim arrives, swelling
// gently with each size pulse.
// Refraction carries the aura through the body; lower centre alpha lets the ink
// beneath remain visible. The rim uses the same interior tint, thin and narrowing
// ring by ring, never a hard white outline — and there is no specular gloss: the
// glass body remains unlit, with restrained diagonal key-light highlights catching
// only the facing part of the half-width rim.
//
// Colour round-trips exactly: the aura copy is uploaded as raw sRGB, the shader does
// no colour-space conversion and the renderer applies no tone mapping, so a bead that
// bent the field by nothing would be invisible against the DOM aura around it.
//
// The camera is orthographic with its frustum set to the hero in CSS pixels, so one
// world unit is one pixel and the lattice's Frame maps straight through (with the y
// flip). Nothing here loads until the conversation starts: VoiceHero imports this
// module dynamically on play, so three.js stays off the page's critical path.
//
import * as THREE from "three";
import { AURA_COPY_WIDTH, AURA_UPLOAD_INTERVAL_MS, auraCopySize, AuraTextureRefresh } from "./auraTexture";
import { LATTICE, PILL_ASPECT, type BeadPose, type BeadShape, type Lattice } from "./lattice";
import { PERSONA_TRANSITION_MS, easeInOutCubic } from "./motion";

/** Subtle Gaussian backdrop blur of the real DOM background, beneath the glass. */
const FROST_BLUR_PX = 14;
/** The field seen through a bead is lifted above the field around it, so the rings
 *  read as lit glass standing off the ground rather than windows onto it. Folded into
 *  the frost's blur: one filter, no extra layer. 1.12 rather than the
 *  1.2 it was while the cell sat at 0.68 opacity: the cell is denser now (see LOOKS),
 *  and this is the lift that keeps the bead as bright as it was. */
const FROST_FILTER = `blur(${FROST_BLUR_PX}px) brightness(1.12)`;
/** The frost is one masked layer, not one backdrop per cell.
 *
 *  Every backdrop-filter element is a compositor pass of its own, and every one that
 *  moves is re-blurred each frame. With one per cell, 32 of them were most of the
 *  ring's cost: a 207px ring over a textured field held Chrome's GPU process at ~75%
 *  of a core, ~90% for the page (M5, DPR 2), and Firefox at ~50fps on a 120Hz Mac. So
 *  the blur lives on a single layer over the beads' bounding box, and an SVG mask cuts
 *  it to them — one rect per cell, each at that cell's opacity, so the frost still
 *  breathes and fades bead by bead. Chrome ~90% → ~16% for the page, which is what the
 *  ring costs with no frost at all; Firefox ~49 → ~95fps through a persona change.
 *  Against the per-cell layers in one frozen frame: under 1% of pixels move by more
 *  than 8/255 in Chrome, all on antialiased rims; in WebKit, 0.03% by more than 4. */
const SVG_NS = "http://www.w3.org/2000/svg";
let frostMaskSerial = 0;
/** The same lift for the field the WebGL glass refracts. */
const GLASS_SEEN_LIFT = "1.12";
export interface OrbClusterRendererOptions {
  getBackdrop?: () => RingBackdropSource | null;
  auraTextureEnabled?: boolean;
  frostEnabled?: boolean;
  domBackdropsEnabled?: boolean;
}

/** Optional host canvas used for glass refraction. The revision avoids unnecessary GPU uploads. */
export interface RingBackdropSource {
  canvas: HTMLCanvasElement;
  revision?: number;
}

// ---- per-shape look --------------------------------------------------------------------

interface Look {
  /** how far the refracted sample mixes toward the body tint (0 = clear glass) */
  milk: number;
  /** mip level of the aura copy to sample: higher is more frosted */
  frost: number;
  /** lens strength: how far across the field a ray at the silhouette reaches, in bead
   *  radii. Above ~1 the bead shows what lies beyond its own edge, as a glass sphere
   *  does, which is what makes the field visibly pass through it. */
  refract: number;
  /** spread between the red and blue samples, as a fraction of `refract` */
  dispersion: number;
  /** thin-film colour at the rim */
  irid: number;
  /** width of the rolled-edge band, in units of glass thickness (0 center → 1
   *  silhouette). Widest on the inner squares, narrowest on the outer circles. */
  rim: number;
  /** outer-border rim-highlight gain: the squares read dimmer than the round
   *  beads at the same gain (flat face, fewer tilted pixels), so they get a
   *  higher gain to match. */
  rimGain: number;
  /** how much of the bead is drawn over the field beneath it; the rest is the field
   *  itself showing through, so lower is more transparent */
  opacity: number;
  /** opacity of the DOM frost beneath the WebGL surface, and of the glow on it */
  backdrop: number;
  /** strength of the white glow the shader paints over that frost (cellGlow) */
  glow: number;
}
// The squares and circles carry a firmer body than their clear-glass look alone would,
// so the beads read against the field rather than dissolving into it — at 0.22 opacity
// they came out the field's own colour with only the rims to find them by.
//
// There used to be a second DOM layer per bead: a soft white infill under a 42px
// backdrop blur, over this one at 0.68. It was the most expensive thing on the
// conversation screen — 32 more backdrop passes a frame held Chrome at ~52fps on a
// 120Hz Mac, ~119 without — and what it did can be had from one layer. Mostly it hid
// the sharp field: between the two, only (1 - 0.68) x (1 - 0.85) ≈ 5% of it showed
// through a bead, so `backdrop` is now that density on its own (0.97 for the pills,
// whose pair let through 3%). Its white is `glow`, sized so that glow x backdrop is the
// infill's old opacity. Matched against the two-layer render in one frozen frame in
// Chrome: the bead interiors land within 1/255 of their old brightness and halftone
// contrast. (Firefox's screenshots leave backdrop filters out, so it can't be matched
// the same way; it renders the same CSS.)
const LOOKS: Record<BeadShape, Look> = {
  square: { milk: 0.08, frost: 2.0, refract: 1.0, dispersion: 0.025, irid: 0.02, rim: 0.6, rimGain: 8.1, opacity: 0.28, backdrop: 0.95, glow: 0.895 },
  pill: { milk: 0.6, frost: 3.5, refract: 0.75, dispersion: 0.02, irid: 0.015, rim: 0.15, rimGain: 2.7, opacity: 0.34, backdrop: 0.97, glow: 0.8 },
  circle: { milk: 0.08, frost: 2.2, refract: 1.25, dispersion: 0.025, irid: 0.025, rim: 0.09, rimGain: 3.6, opacity: 0.28, backdrop: 0.95, glow: 0.895 },
};
/** Draw order: the clearest first, so a frosted pill over a square frosts the square. */
const SHAPES: BeadShape[] = ["square", "circle", "pill"];
/** Maximum analytical capsule tilt used to keep pills gently moving in depth. */
const PILL_TILT_MAX = 0.35;
// ---- shaders ------------------------------------------------------------------------------

const VERT = /* glsl */ `
attribute float aAlpha;
attribute float aRimAlpha;
attribute float aFill;
attribute float aLamp;
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uTiltMax;
varying vec3 vNormal;
varying float vTilt;
varying float vAlpha;
varying float vRimAlpha;
varying float vFill;
varying float vLamp;
varying float vRadius;
varying vec2 vViewXY;
varying vec2 vCenterXY;
void main() {
  vec3 n = normalize(normal);
  vec3 p = position;
  vTilt = sin(uTime * 0.25 + aSeed * 6.28) * uTiltMax;
  // Keep the quad face-on; its curved normal is reconstructed per fragment.
  // One CSS pixel of padding lets coverage fade outside the true silhouette.
  vec3 dp = p;
  dp.xy += sign(p.xy) / max(aSize, 1e-4);
  mat4 mv = modelViewMatrix * instanceMatrix;
  vec4 mvPos = mv * vec4(dp, 1.0);
  vec4 mvCenter = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // Per-instance scale is uniform, so the upper-left 3x3 carries the normal.
  vNormal = normalize(mat3(mv) * n);
  vAlpha = aAlpha;
  vRimAlpha = aRimAlpha;
  vFill = aFill;
  vLamp = aLamp;
  vRadius = aSize * 0.5;
  // View-space offset from the bead's own centre, in the same units as vRadius,
  // so the fragment stage can mask the glow to the bead's own shape. This is
  // what confines the inner light on the flat squares too: their faces share one
  // normal, so an ndv mask would light the whole face.
  vViewXY = mvPos.xy;
  vCenterXY = mvCenter.xy;
  gl_Position = projectionMatrix * mvPos;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uAura;
uniform float uAuraEnabled;
uniform vec2 uResolution;
uniform float uDpr;
uniform vec3 uBody;
uniform vec3 uEdge;
uniform float uMilk;
uniform float uFrost;
uniform float uAuraLodOffset;
uniform float uRefract;
uniform float uDispersion;
uniform float uIrid;
uniform float uRimW;
uniform float uRimGain;
uniform float uOpacity;
uniform float uShape;
uniform float uPillHalfLength;
uniform float uGlowEnabled;
uniform float uBackdrop;
uniform float uGlow;
varying vec3 vNormal;
varying float vTilt;
varying float vAlpha;
varying float vRimAlpha;
varying float vFill;
varying float vLamp;
varying float vRadius;
varying vec2 vViewXY;
varying vec2 vCenterXY;
// Ray/surface intersections for the orthographic camera, in units of
// bead diameter. Return the front surface's normal and its 2D silhouette distance.
vec3 glassNormal(vec2 p, out float silhouette) {
  if (uShape < 0.5) {
    // Rounded box: flat front, cylindrical edges, spherical corners (radius .15).
    vec2 q = abs(p) - vec2(0.35);
    vec2 edge = max(q, 0.0);
    silhouette = length(edge) + min(max(q.x, q.y), 0.0) - 0.15;
    float z = sqrt(max(0.15 * 0.15 - dot(edge, edge), 0.0));
    return normalize(vec3(sign(p) * edge, z));
  }
  if (uShape > 1.5) {
    silhouette = length(p) - 0.5;
    return normalize(vec3(p, sqrt(max(0.25 - dot(p, p), 0.0))));
  }

  // The capsule's axis is (cos(tilt), 0, -sin(tilt)), including foreshortening
  // and the tilted normal.
  float ct = cos(vTilt);
  float st = sin(vTilt);
  float h = uPillHalfLength;
  vec2 projected = vec2(p.x - clamp(p.x, -h * ct, h * ct), p.y);
  silhouette = length(projected) - 0.5;
  // At antialiased pixels just outside the surface, use the silhouette normal.
  vec3 normal = vec3(projected, 0.0);
  float front = -1e6;
  float radial2 = 0.25 - p.y * p.y;
  if (radial2 >= 0.0) {
    float radial = sqrt(radial2);
    float axis = (p.x - st * radial) / ct;
    if (abs(axis) <= h) {
      front = (radial - p.x * st) / ct;
      normal = vec3(st * radial, p.y, ct * radial);
    }
  }
  // The capsule is the union of its finite cylinder and two endpoint spheres.
  // Choose the nearest front hit, so the seams have continuous surface normals.
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    vec3 center = side * h * vec3(ct, 0.0, -st);
    vec2 offset = p - center.xy;
    float cap2 = 0.25 - dot(offset, offset);
    if (cap2 >= 0.0) {
      float z = sqrt(cap2);
      if (center.z + z > front) {
        front = center.z + z;
        normal = vec3(offset, z);
      }
    }
  }
  return normalize(normal);
}
// The glow's alpha along its radius: the stops of the CSS gradient it was, 0 at the centre to 1 at the corners.
float glowRamp(float t) {
  if (t < 0.24) return mix(0.13, 0.1, t / 0.24);
  if (t < 0.45) return mix(0.1, 0.074, (t - 0.24) / 0.21);
  if (t < 0.48) return mix(0.074, 0.067, (t - 0.45) / 0.03);
  if (t < 0.60) return mix(0.067, 0.0434, (t - 0.48) / 0.12);
  if (t < 0.72) return mix(0.0434, 0.0245, (t - 0.60) / 0.12);
  if (t < 0.86) return mix(0.0245, 0.0061, (t - 0.72) / 0.14);
  return mix(0.0061, 0.0, clamp((t - 0.86) / 0.14, 0.0, 1.0));
}
// A soft white glow in the middle of each cell, over its frost, feathered out before
// the rim. It was a DOM layer per cell — radial-gradient(ellipse at center), so its
// ending ellipse reaches the corners of the cell's box (inset like the frost, with the
// same rounded corners) — and drawing it here, under the glass, composites the same
// way while sparing 32 elements a style write every frame. p is the offset from the
// bead's centre in CSS pixels.
float cellGlow(vec2 p) {
  float size = 2.0 * vRadius;
  float inset = size * 0.04;
  float aspect = uShape > 0.5 && uShape < 1.5 ? 1.0 + 2.0 * uPillHalfLength : 1.0;
  vec2 halfBox = vec2(size * aspect, size) * 0.5 - inset;
  float corner = uShape < 0.5 ? size * 0.15 - inset : halfBox.y;
  vec2 q = abs(p) - (halfBox - corner);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
  float clip = clamp(0.5 - d * uDpr, 0.0, 1.0);
  return glowRamp(length(p / (halfBox * 1.41421356))) * uGlow * uBackdrop * vAlpha * clip;
}
void main() {
  vec3 N = normalize(vNormal);
  float silhouette;
  N = glassNormal((vViewXY - vCenterXY) / max(2.0 * vRadius, 1e-4), silhouette);
  // Pixel-sized coverage, independent of bead size and DPR. Calculate derivatives
  // before discard and clip empty corners before the expensive glass texture taps.
  float coverage = clamp(0.5 - silhouette / max(fwidth(silhouette), 1e-5), 0.0, 1.0);
  if (coverage <= 0.0) discard;
  // Orthographic: the view direction is the same everywhere.
  vec3 V = vec3(0.0, 0.0, 1.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float thick = 1.0 - ndv;
  // A thin rolled edge, narrowing ring by ring (uRimW, widest on the inner
  // squares). A diagonal key light catches only the facing part of the border;
  // the rest of the edge keeps just its thin tint.
  float rim = smoothstep(0.78 - uRimW, 0.78, thick);
  // Shape-matched distance from the bead's centre: 0 at the centre, ~1 at the
  // silhouette for every shape — rounded-box SDF for the squares, capsule along
  // view X (the pills' long axis) for the pills, radial for the circles. The
  // glow and the frost below key off the shape itself, never a circular stamp,
  // which is also what confines the light on the flat squares: their faces
  // share one normal, so an ndv mask would light the whole face.
  vec2 uo = (vViewXY - vCenterXY) / max(vRadius, 1e-4);
  float sd;
  float maxD;
  if (uShape < 0.5) {
    vec2 qq = abs(uo) - vec2(0.7);
    sd = length(max(qq, 0.0)) + min(max(qq.x, qq.y), 0.0) - 0.3;
    maxD = 1.0;
  } else if (uShape < 1.5) {
    vec2 pp = vec2(max(abs(uo.x) - 0.2, 0.0), uo.y);
    sd = length(pp) - 1.0;
    maxD = 1.0;
  } else {
    sd = length(uo) - 1.0;
    maxD = 1.0;
  }
  float s = clamp(1.0 + sd / maxD, 0.0, 1.2);

  // The lens. The screen is the texture's UV space. A ray through the bead lands on
  // the field displaced against the surface tilt, by a distance measured in the bead's
  // own radius (so a small bead lenses as strongly as a large one) that grows toward
  // the silhouette. Past one radius the bead shows the field beyond its own edge, the
  // way a glass sphere carries an inverted picture of what is behind it.
  vec2 uv = gl_FragCoord.xy / uResolution;
  float bend = uRefract * (0.3 + 0.7 * pow(1.0 - ndv, 1.5));
  vec2 off = -N.xy * vRadius * bend * uDpr / uResolution;
  // Keep the frost footprint in screen space when a portrait copy is smaller.
  float lod = uFrost + vFill * 2.0 + uAuraLodOffset;
  // Frosted glass: the background behind the bead is averaged over a small disc,
  // so it reads as seen through frost rather than clear glass. The disc grows
  // with the shape's frost and swells with the fill pulse.
  vec2 brad = (2.0 + uFrost * 3.5 + vFill * 6.0) * uDpr / uResolution;
  vec2 cr = uv + off * (1.0 - uDispersion);
  vec2 cg = uv + off;
  vec2 cb = uv + off * (1.0 + uDispersion);
  vec3 seen = uBody;
  vec2 t1 = vec2(1.0, 0.0); vec2 t2 = vec2(-1.0, 0.0);
  vec2 t3 = vec2(0.0, 1.0); vec2 t4 = vec2(0.0, -1.0);
  vec2 t5 = vec2(0.7071, 0.7071); vec2 t6 = vec2(-0.7071, 0.7071);
  vec2 t7 = vec2(0.7071, -0.7071); vec2 t8 = vec2(-0.7071, -0.7071);
  if (uAuraEnabled > 0.5) {
    seen = vec3(
      textureLod(uAura, cr, lod).r,
      textureLod(uAura, cg, lod).g,
      textureLod(uAura, cb, lod).b
    );
#ifdef FROST
      seen *= 0.25;
      seen.r += (textureLod(uAura, cr + t1 * brad, lod).r + textureLod(uAura, cr + t2 * brad, lod).r + textureLod(uAura, cr + t3 * brad, lod).r + textureLod(uAura, cr + t4 * brad, lod).r + textureLod(uAura, cr + t5 * brad, lod).r + textureLod(uAura, cr + t6 * brad, lod).r + textureLod(uAura, cr + t7 * brad, lod).r + textureLod(uAura, cr + t8 * brad, lod).r) * 0.09375;
      seen.g += (textureLod(uAura, cg + t1 * brad, lod).g + textureLod(uAura, cg + t2 * brad, lod).g + textureLod(uAura, cg + t3 * brad, lod).g + textureLod(uAura, cg + t4 * brad, lod).g + textureLod(uAura, cg + t5 * brad, lod).g + textureLod(uAura, cg + t6 * brad, lod).g + textureLod(uAura, cg + t7 * brad, lod).g + textureLod(uAura, cg + t8 * brad, lod).g) * 0.09375;
      seen.b += (textureLod(uAura, cb + t1 * brad, lod).b + textureLod(uAura, cb + t2 * brad, lod).b + textureLod(uAura, cb + t3 * brad, lod).b + textureLod(uAura, cb + t4 * brad, lod).b + textureLod(uAura, cb + t5 * brad, lod).b + textureLod(uAura, cb + t6 * brad, lod).b + textureLod(uAura, cb + t7 * brad, lod).b + textureLod(uAura, cb + t8 * brad, lod).b) * 0.09375;
#endif
  }

  // Brighter than the field outside the bead (GLASS_SEEN_LIFT).
  seen *= ${GLASS_SEEN_LIFT};

  // Frost grows inside the clear shell, never a flat white wash. The body mask
  // keeps it (like the inner light) to the middle of the glass, so the
  // periphery stays clear and only the rim gathers more tinted fill, faking
  // extra material at the perimeter.
  float milk = uMilk + vFill * 0.4;
  vec3 glassTint = mix(uBody, seen, 0.15);
  float body = 1.0 - smoothstep(0.65, 1.05, s);
  vec3 col = mix(seen, glassTint, clamp(milk * body + rim * 0.38, 0.0, 0.8));
  col = mix(col, uEdge, fres * 0.02);

  // Reflection: the field again, mirrored across the surface and blurred a step more.
  vec3 refl = vec3(0.0);
  if (uAuraEnabled > 0.5) {
    refl = textureLod(uAura, uv + N.xy * 0.08 * vec2(uResolution.y / uResolution.x, 1.0), lod + 1.0).rgb;
  }
  col += refl * fres * 0.055;

  // Thin film at the rim.
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (ndv * 1.6 + vec3(0.0, 0.33, 0.67)));
  col += irid * fres * uIrid;

  // Keep the glass body unlit; only the rolled edge catches the key light.
  float lit = vLamp;
  vec3 lamp = mix(vec3(1.0), glassTint, 0.72);

  // Static opposing rim catches: strong at the top-left and softer at the
  // bottom-right. Voice pulses never rotate or brighten the rim treatment.
  vec2 lightDir = normalize(vec2(-0.7071, 0.7071));
  vec2 nDir = N.xy / max(length(N.xy), 1e-4);
  // Squares carry a broader catch across their long rounded corners. Pills and
  // circles retain the tighter highlight footprint.
  float catchFalloff = uShape < 0.5 ? 4.0 : 6.0;
  // The top-left catch (the primary key-light hit) read too large on the squares
  // at that broad falloff; tighten just that lobe back to the pill/circle footprint.
  // The softer bottom-right catch keeps the wider spread.
  float topLeftFalloff = uShape < 0.5 ? 5.0 : catchFalloff;
  float topLeftCatch = pow(max(dot(nDir, lightDir), 0.0), topLeftFalloff);
  float bottomRightCatch = pow(max(dot(nDir, -lightDir), 0.0), catchFalloff) * 0.65;
  float rimCatch = topLeftCatch + bottomRightCatch;
  vec3 rimLight = mix(vec3(1.0), lamp, 0.12);
  col += rimLight * rim * rimCatch * uRimGain * lit;

  // What is not drawn here is the DOM aura showing through beneath — the same field,
  // unbent — so a lower opacity reads as clearer glass, not as a fainter object.
  // The centre stays translucent enough for the ink to show through; the rim is
  // fully opaque (no glass transparency there) so the highlight can hit full
  // bright instead of compositing down against the field. The rim has its own
  // entrance/settle visibility, independent of the body's animated opacity.
  float directionalRimAlpha = vRimAlpha * (0.08 + 0.92 * clamp(rimCatch, 0.0, 1.0));
  float a = mix(vAlpha * uOpacity * (0.48 + vFill * 0.10), directionalRimAlpha, rim);
  vec3 premultiplied = col * a;
  // Match an MSAA-resolved mesh edge: saturate a covered sample's bright rim
  // before applying its coverage, rather than letting HDR values widen the edge.
  premultiplied = min(premultiplied, vec3(1.0));
  float glow = uGlowEnabled > 0.5 ? cellGlow(vViewXY - vCenterXY) : 0.0;
  gl_FragColor = vec4(premultiplied + (1.0 - a) * vec3(glow), a + (1.0 - a) * glow) * coverage;
}
`;

// ---- helpers --------------------------------------------------------------------------------

interface ShapeSet {
  shape: BeadShape;
  count: number;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  alpha: THREE.InstancedBufferAttribute;
  rimAlpha: THREE.InstancedBufferAttribute;
  fill: THREE.InstancedBufferAttribute;
  lamp: THREE.InstancedBufferAttribute;
  seed: THREE.InstancedBufferAttribute;
  size: THREE.InstancedBufferAttribute;
}

// ---- the beads -----------------------------------------------------------------------------

interface FrostLayer {
  element: HTMLDivElement;
  svg: SVGSVGElement;
  rects: SVGRectElement[];
  /** Per cell, this frame: x, y, width, height, radius, opacity. */
  geometry: Float32Array;
}

export class OrbClusterRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly meshRefs: Record<BeadShape, THREE.InstancedMesh>;
  private readonly poseBuffer: BeadPose[] = [];
  private readonly refresh = new AuraTextureRefresh();
  private readonly frost: FrostLayer;
  private readonly shared;
  private readonly sets: ShapeSet[];
  private readonly tmp = {
    m: new THREE.Matrix4(),
    p: new THREE.Vector3(),
    s: new THREE.Vector3(),
    res: new THREE.Vector2(),
    body: new THREE.Color(),
    edge: new THREE.Color(),
  };
  // The glass tint eases to a new persona over the backdrop's own window instead of
  // cutting to it: `lattice.ramp` is set in one go, and read raw it snapped the ring
  // to the new colour seconds ahead of the field underneath.
  private readonly rampFrom = { body: new THREE.Color(), edge: new THREE.Color() };
  private readonly rampTo = { body: new THREE.Color(), edge: new THREE.Color() };
  private rampKey = "";
  private rampStartedAt = 0;
  private options: Required<Omit<OrbClusterRendererOptions, "getBackdrop">> & Pick<OrbClusterRendererOptions, "getBackdrop">;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly lattice: Lattice,
    options: OrbClusterRendererOptions = {},
  ) {
    this.options = {
      getBackdrop: options.getBackdrop,
      auraTextureEnabled: options.auraTextureEnabled ?? true,
      frostEnabled: options.frostEnabled ?? true,
      domBackdropsEnabled: options.domBackdropsEnabled ?? true,
    };

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    Object.assign(this.renderer.domElement.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
      pointerEvents: "none",
    });
    this.camera.position.set(0, 0, 100);

    this.frost = createFrostLayer(host);
    host.append(this.renderer.domElement);

    // The aura copy and the uniforms every shape shares.
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    this.shared = {
      canvas,
      ctx,
      texture,
      uAura: { value: texture },
      uAuraEnabled: { value: 1 },
      uAuraLodOffset: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uTime: { value: 0 },
      uBody: { value: new THREE.Vector3(1, 1, 1) },
      uEdge: { value: new THREE.Vector3(0.94, 0.94, 0.94) },
      uGlowEnabled: { value: this.options.domBackdropsEnabled ? 1 : 0 },
    };

    this.sets = SHAPES.map((shape) => {
      const points = LATTICE.filter((p) => p.shape === shape);
      const count = points.length;
      const geometry = new THREE.PlaneGeometry(shape === "pill" ? PILL_ASPECT : 1, 1);
      const attr = () => new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
      const alpha = attr();
      const rimAlpha = attr();
      const fill = attr();
      const lamp = attr();
      const seed = attr();
      const size = attr();
      for (const a of [alpha, rimAlpha, fill, lamp, size]) a.setUsage(THREE.DynamicDrawUsage);
      seed.setUsage(THREE.StaticDrawUsage);
      points.forEach((point, i) => seed.setX(i, point.seed));
      geometry.setAttribute("aAlpha", alpha);
      geometry.setAttribute("aRimAlpha", rimAlpha);
      geometry.setAttribute("aFill", fill);
      geometry.setAttribute("aLamp", lamp);
      geometry.setAttribute("aSeed", seed);
      geometry.setAttribute("aSize", size);
      const look = LOOKS[shape];
      const material = new THREE.ShaderMaterial({
        defines: this.options.frostEnabled ? { FROST: 1 } : {},
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        uniforms: {
          uAura: this.shared.uAura,
          uAuraEnabled: this.shared.uAuraEnabled,
          uAuraLodOffset: this.shared.uAuraLodOffset,
          uResolution: this.shared.uResolution,
          uDpr: this.shared.uDpr,
          uTime: this.shared.uTime,
          uBody: this.shared.uBody,
          uEdge: this.shared.uEdge,
          uTiltMax: { value: PILL_TILT_MAX },
          uPillHalfLength: { value: (PILL_ASPECT - 1) / 2 },
          uMilk: { value: look.milk },
          uFrost: { value: look.frost },
          uRefract: { value: look.refract },
          uDispersion: { value: look.dispersion },
          uIrid: { value: look.irid },
          uRimW: { value: look.rim },
          uRimGain: { value: look.rimGain },
          uOpacity: { value: look.opacity },
          uShape: { value: shape === "square" ? 0 : shape === "pill" ? 1 : 2 },
          uGlowEnabled: this.shared.uGlowEnabled,
          uBackdrop: { value: look.backdrop },
          uGlow: { value: look.glow },
        },
      });
      return { shape, count, geometry, material, alpha, rimAlpha, fill, lamp, seed, size };
    });
    this.meshRefs = { square: null!, pill: null!, circle: null! };
    this.sets.forEach((set, order) => {
      const mesh = new THREE.InstancedMesh(set.geometry, set.material, set.count);
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      this.meshRefs[set.shape] = mesh;
      this.scene.add(mesh);
    });
    this.updateDomVisibility();
    this.resize(host.clientWidth, host.clientHeight);
  }

  updateOptions(options: Partial<OrbClusterRendererOptions>): void {
    if (this.disposed) return;
    const frostChanged = options.frostEnabled !== undefined && options.frostEnabled !== this.options.frostEnabled;
    const backdropChanged = Object.hasOwn(options, "getBackdrop") && options.getBackdrop !== this.options.getBackdrop;
    const auraChanged = options.auraTextureEnabled !== undefined && options.auraTextureEnabled !== this.options.auraTextureEnabled;
    this.options = { ...this.options, ...options };
    this.shared.uAuraEnabled.value = this.options.auraTextureEnabled && this.options.getBackdrop?.() ? 1 : 0;
    if (this.options.auraTextureEnabled && (backdropChanged || auraChanged)) this.refresh.resume();
    if (frostChanged) {
      for (const set of this.sets) {
        if (this.options.frostEnabled) set.material.defines.FROST = 1;
        else delete set.material.defines.FROST;
        set.material.needsUpdate = true;
      }
    }
    this.updateDomVisibility();
  }

  resize(width: number, height: number): void {
    if (this.disposed) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.left = -this.width / 2;
    this.camera.right = this.width / 2;
    this.camera.top = this.height / 2;
    this.camera.bottom = -this.height / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)));
    this.renderer.setSize(this.width, this.height, false);
  }

  resume(): void {
    if (!this.disposed && this.options.auraTextureEnabled) this.refresh.resume();
  }

  render(delta: number): void {
    if (this.disposed) return;
    const poses = this.lattice.step(delta, undefined, this.poseBuffer);
    // Lattice callbacks are synchronous; a settled handler may remove its host and
    // dispose this renderer before step() returns.
    if (this.disposed) return;
    // Use the same frame's poses as the meshes, with no React renders per frame.
    // Geometry is face-on: rounded squares, horizontal capsules and circles.
    // Inset the blur slightly so it ends inside the clear rolled rim.
    const frost = this.options.domBackdropsEnabled ? this.frost : null;
    for (let i = 0; frost && i < frost.rects.length; i++) {
      const pose = poses[i];
      if (!pose || pose.size <= 0 || pose.alpha <= 0) {
        frost.geometry[i * 6 + 5] = 0;
        continue;
      }
      const inset = pose.size * 0.04;
      const width = pose.size * (pose.shape === "pill" ? PILL_ASPECT : 1) - inset * 2;
      const height = pose.size - inset * 2;
      const radius = pose.shape === "square" ? pose.size * 0.15 - inset : height / 2;
      const g = frost.geometry;
      const o = i * 6;
      g[o] = pose.x - width / 2;
      g[o + 1] = pose.y - height / 2;
      g[o + 2] = width;
      g[o + 3] = height;
      g[o + 4] = radius;
      g[o + 5] = LOOKS[pose.shape].backdrop * pose.alpha;
    }
    if (frost) placeFrost(frost);
    // Keep the glass canvas crisp; clear a stale filter after hot reloads too.
    if (this.renderer.domElement.style.filter) this.renderer.domElement.style.filter = "";
    this.shared.uTime.value += Math.min(0.05, delta);
    this.easeRamp();
    this.shared.uBody.value.set(this.tmp.body.r, this.tmp.body.g, this.tmp.body.b);
    this.shared.uEdge.value.set(this.tmp.edge.r, this.tmp.edge.g, this.tmp.edge.b);
    this.renderer.getDrawingBufferSize(this.tmp.res);
    this.shared.uResolution.value.copy(this.tmp.res);
    this.shared.uDpr.value = this.renderer.getPixelRatio();

    // Refresh the aura copy. The two canvases cover the same box, so a plain scaled
    // draw keeps the UV space aligned with the screen. Size the copy to the aspect.
    const now = performance.now();
    const backdrop = this.options.getBackdrop?.() ?? null;
    const source = backdrop?.canvas ?? null;
    const revision = backdrop?.revision ?? Math.floor(now / AURA_UPLOAD_INTERVAL_MS);
    this.shared.uAuraEnabled.value = this.options.auraTextureEnabled && source ? 1 : 0;
    if (this.options.auraTextureEnabled && source && this.shared.ctx && this.refresh.needsUpload(now, revision, source.width, source.height)) {
      const copy = auraCopySize(source.width, source.height);
      if (this.shared.canvas.width !== copy.width || this.shared.canvas.height !== copy.height) {
        // Three's immutable GPU storage must be reallocated when dimensions change.
        this.shared.texture.dispose();
        this.shared.canvas.width = copy.width;
        this.shared.canvas.height = copy.height;
      }
      this.shared.uAuraLodOffset.value = Math.log2(copy.width / AURA_COPY_WIDTH);
      this.shared.ctx.drawImage(source, 0, 0, copy.width, copy.height);
      this.shared.texture.needsUpdate = true;
      this.refresh.didUpload(now, revision, source.width, source.height);
    }

    // Poses to instances. World x/y are CSS pixels from the hero's centre, y up.
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    for (const set of this.sets) {
      const mesh = this.meshRefs[set.shape];
      let i = 0;
      for (const pose of poses) {
        // Staggered entrance beads can be exactly zero-sized. Leave them out rather
        // than sending a singular instance matrix (and zero normals) to the shader.
        if (pose.shape !== set.shape || pose.size <= 0 || pose.alpha <= 0) continue;
        placeInstance(pose, halfW, halfH, this.tmp);
        mesh.setMatrixAt(i, this.tmp.m);
        set.alpha.setX(i, pose.alpha);
        set.rimAlpha.setX(i, pose.rimAlpha);
        set.fill.setX(i, pose.fill);
        set.lamp.setX(i, pose.lamp);
        set.size.setX(i, pose.size);
        i++;
      }
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
      set.alpha.needsUpdate = true;
      set.rimAlpha.needsUpdate = true;
      set.fill.needsUpdate = true;
      set.lamp.needsUpdate = true;
      set.size.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const set of this.sets) {
      this.scene.remove(this.meshRefs[set.shape]);
      this.meshRefs[set.shape].dispose();
      set.geometry.dispose();
      set.material.dispose();
    }
    this.shared.texture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.frost.element.remove();
    this.frost.svg.remove();
  }

  /** Move the glass tint toward `lattice.ramp`, from wherever it is now. A change of
   *  target mid-ease restarts the ease from the colour on screen, so a second lean
   *  arriving early bends the motion instead of jumping it. */
  private easeRamp(): void {
    const { sky, mid } = this.lattice.ramp;
    const key = `${sky}|${mid}`;
    const now = performance.now();
    if (key !== this.rampKey) {
      const first = this.rampKey === "";
      this.rampKey = key;
      this.rampStartedAt = now;
      this.rampTo.body.set(sky);
      this.rampTo.edge.set(mid);
      this.rampFrom.body.copy(first ? this.rampTo.body : this.tmp.body);
      this.rampFrom.edge.copy(first ? this.rampTo.edge : this.tmp.edge);
    }
    const t = this.lattice.reducedMotion ? 1 : Math.min(1, (now - this.rampStartedAt) / PERSONA_TRANSITION_MS);
    const eased = easeInOutCubic(t);
    this.tmp.body.lerpColors(this.rampFrom.body, this.rampTo.body, eased);
    this.tmp.edge.lerpColors(this.rampFrom.edge, this.rampTo.edge, eased);
  }

  private updateDomVisibility(): void {
    this.frost.element.style.display = this.options.domBackdropsEnabled ? "" : "none";
    this.shared.uGlowEnabled.value = this.options.domBackdropsEnabled ? 1 : 0;
  }
}

/** The single frost layer: one backdrop blur, cut to the beads by an SVG mask with a
 *  rect per cell. Starts empty; placeFrost fits it each frame. */
function createFrostLayer(host: HTMLElement): FrostLayer {
  const id = `vh-bead-frost-${++frostMaskSerial}`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  const mask = document.createElementNS(SVG_NS, "mask");
  mask.id = id;
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("maskContentUnits", "userSpaceOnUse");
  for (const [name, value] of [["x", "0"], ["y", "0"], ["width", "100000"], ["height", "100000"]]) mask.setAttribute(name, value);
  const rects = LATTICE.map(() => {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("fill", "white");
    rect.setAttribute("width", "0");
    mask.append(rect);
    return rect;
  });
  svg.append(mask);
  const element = document.createElement("div");
  element.dataset.beadFrost = "";
  element.setAttribute("aria-hidden", "true");
  Object.assign(element.style, {
    position: "absolute", left: "0", top: "0", width: "0", height: "0",
    pointerEvents: "none",
    backdropFilter: FROST_FILTER,
    mask: `url(#${id})`,
  });
  element.style.setProperty("-webkit-backdrop-filter", FROST_FILTER);
  element.style.setProperty("-webkit-mask", `url(#${id})`);
  host.append(svg, element);
  return { element, svg, rects, geometry: new Float32Array(LATTICE.length * 6) };
}

/** Fit the frost layer to the beads' bounding box, so the blur reads no more of the
 *  field than they cover, and cut it to them: each mask rect is its cell, in the
 *  layer's own coordinates. */
function placeFrost(frost: FrostLayer): void {
  const g = frost.geometry;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < frost.rects.length; i++) {
    const o = i * 6;
    if (g[o + 5] <= 0) continue;
    left = Math.min(left, g[o]);
    top = Math.min(top, g[o + 1]);
    right = Math.max(right, g[o] + g[o + 2]);
    bottom = Math.max(bottom, g[o + 1] + g[o + 3]);
  }
  const style = frost.element.style;
  if (right <= left) {
    style.width = "0";
    return;
  }
  left = Math.floor(left);
  top = Math.floor(top);
  style.transform = `translate(${left}px, ${top}px)`;
  style.width = `${Math.ceil(right - left)}px`;
  style.height = `${Math.ceil(bottom - top)}px`;
  for (let i = 0; i < frost.rects.length; i++) {
    const o = i * 6;
    const rect = frost.rects[i];
    if (g[o + 5] <= 0) {
      rect.setAttribute("width", "0");
      continue;
    }
    rect.setAttribute("x", (g[o] - left).toFixed(2));
    rect.setAttribute("y", (g[o + 1] - top).toFixed(2));
    rect.setAttribute("width", g[o + 2].toFixed(2));
    rect.setAttribute("height", g[o + 3].toFixed(2));
    rect.setAttribute("rx", g[o + 4].toFixed(2));
    rect.setAttribute("fill-opacity", g[o + 5].toFixed(3));
  }
}

/** Build one instance's matrix from a pose. The lattice's y runs down the screen and
 *  its angles are screen-space, so both flip here. */
function placeInstance(
  pose: BeadPose,
  halfW: number,
  halfH: number,
  tmp: { m: THREE.Matrix4; p: THREE.Vector3; s: THREE.Vector3 },
): void {
  tmp.p.set(pose.x - halfW, halfH - pose.y, 0);
  tmp.s.setScalar(pose.size);
  tmp.m.makeScale(tmp.s.x, tmp.s.y, tmp.s.z);
  tmp.m.setPosition(tmp.p);
}
