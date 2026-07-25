#!/usr/bin/env node
/**
 * VisionGo brand asset generator — no dependencies (Node built-ins only).
 *
 * Renders the app icon, adaptive icon, splash mark, favicon, and Android
 * notification icon from a single vector-ish description of the VisionGo
 * mark: a vision board's goal notes orbiting the year at the center
 * (the ◈ diamond used throughout the app).
 *
 * Usage:  node scripts/generate-assets.js
 * Output: assets/icon.png              1024×1024 RGB (no alpha — App Store req)
 *         assets/adaptive-icon.png     1024×1024 RGBA (transparent bg, safe zone)
 *         assets/splash.png            1024×1024 RGBA (transparent bg)
 *         assets/favicon.png           64×64 RGBA
 *         assets/notification-icon.png 96×96 RGBA (white silhouette)
 *
 * Drawing is done on a supersampled raster (SS×) with soft-edged coverage
 * functions, then box-filtered down for clean antialiasing.
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── Palette (mirrors theme/themes.ts) ─────────────────────────────
const PAPER = '#f3ecdd';
const PAPER_LIGHT = '#f8f2e6';
const PAPER_DEEP = '#e7dcc3';
const INK = '#3a342a';
const CREAM = '#fbf7ec';
const ACCENT = '#5f9e5a';
const NOTE_COLORS = [
  '#f0cf7e', '#abc6a1', '#e3a48c', '#9fbcd6',
  '#c9b3da', '#e6acae', '#d8c69a', '#8fc2b4',
];

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

// ── Raster surface ────────────────────────────────────────────────

class Surface {
  constructor(w, h, ss) {
    this.w = w; this.h = h; this.ss = ss;
    this.W = w * ss; this.H = h * ss;
    // RGBA float accumulation buffer at supersampled resolution
    this.buf = new Float32Array(this.W * this.H * 4);
  }

  // Composite src-over. coverage(x,y) in [0,1] at supersampled coords.
  paint(bbox, coverage, rgb, alpha = 1) {
    const [r, g, b] = rgb;
    const x0 = Math.max(0, Math.floor(bbox[0] * this.ss));
    const y0 = Math.max(0, Math.floor(bbox[1] * this.ss));
    const x1 = Math.min(this.W, Math.ceil(bbox[2] * this.ss));
    const y1 = Math.min(this.H, Math.ceil(bbox[3] * this.ss));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const cov = coverage(x / this.ss, y / this.ss);
        if (cov <= 0) continue;
        const a = Math.min(1, cov) * alpha;
        const i = (y * this.W + x) * 4;
        const da = this.buf[i + 3];
        const oa = a + da * (1 - a);
        if (oa <= 0) continue;
        this.buf[i]     = (r * a + this.buf[i]     * da * (1 - a)) / oa;
        this.buf[i + 1] = (g * a + this.buf[i + 1] * da * (1 - a)) / oa;
        this.buf[i + 2] = (b * a + this.buf[i + 2] * da * (1 - a)) / oa;
        this.buf[i + 3] = oa;
      }
    }
  }

  // Erase (punch alpha out) where coverage applies.
  erase(bbox, coverage) {
    const x0 = Math.max(0, Math.floor(bbox[0] * this.ss));
    const y0 = Math.max(0, Math.floor(bbox[1] * this.ss));
    const x1 = Math.min(this.W, Math.ceil(bbox[2] * this.ss));
    const y1 = Math.min(this.H, Math.ceil(bbox[3] * this.ss));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const cov = coverage(x / this.ss, y / this.ss);
        if (cov <= 0) continue;
        const i = (y * this.W + x) * 4;
        this.buf[i + 3] *= 1 - Math.min(1, cov);
      }
    }
  }

  // Fill entire surface with a radial gradient (for opaque icons).
  radialBackground(cx, cy, innerRGB, outerRGB, maxR) {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const dx = x / this.ss - cx, dy = y / this.ss - cy;
        const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / maxR);
        // ease for a gentle falloff
        const e = t * t * (3 - 2 * t);
        const i = (y * this.W + x) * 4;
        this.buf[i]     = innerRGB[0] + (outerRGB[0] - innerRGB[0]) * e;
        this.buf[i + 1] = innerRGB[1] + (outerRGB[1] - innerRGB[1]) * e;
        this.buf[i + 2] = innerRGB[2] + (outerRGB[2] - innerRGB[2]) * e;
        this.buf[i + 3] = 1;
      }
    }
  }

  // Box-filter down to final size. Returns Uint8Array RGBA.
  resolve() {
    const { w, h, ss } = this;
    const out = new Uint8Array(w * h * 4);
    const n = ss * ss;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < ss; sy++) {
          for (let sx = 0; sx < ss; sx++) {
            const i = ((y * ss + sy) * this.W + (x * ss + sx)) * 4;
            const pa = this.buf[i + 3];
            r += this.buf[i] * pa; g += this.buf[i + 1] * pa; b += this.buf[i + 2] * pa;
            a += pa;
          }
        }
        const o = (y * w + x) * 4;
        if (a > 0) {
          out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a);
        }
        out[o + 3] = Math.round((a / n) * 255);
      }
    }
    return out;
  }
}

// Soft edge helper: signed distance -> coverage with ~0.75px feather.
const soft = (d) => Math.max(0, Math.min(1, 0.5 - d / 1.5));

// ── Shape coverage functions (logical, un-supersampled coords) ────

function circle(surf, cx, cy, r, rgb, alpha = 1) {
  surf.paint(
    [cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2],
    (x, y) => soft(Math.hypot(x - cx, y - cy) - r),
    rgb, alpha,
  );
}

function ring(surf, cx, cy, rMid, thickness, rgb, alpha = 1) {
  const half = thickness / 2;
  const rOut = rMid + half + 2;
  surf.paint(
    [cx - rOut, cy - rOut, cx + rOut, cy + rOut],
    (x, y) => soft(Math.abs(Math.hypot(x - cx, y - cy) - rMid) - half),
    rgb, alpha,
  );
}

function line(surf, x1, y1, x2, y2, width, rgb, alpha = 1) {
  const half = width / 2;
  const pad = half + 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  surf.paint(
    [Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.max(x1, x2) + pad, Math.max(y1, y2) + pad],
    (x, y) => {
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
      return soft(Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) - half);
    },
    rgb, alpha,
  );
}

// Diamond (rotated square), the app's ◈ motif. `half` = center-to-vertex.
function diamondCoverage(cx, cy, half) {
  const s = Math.SQRT1_2; // normalize L1 distance to euclidean-ish
  return (x, y) => soft((Math.abs(x - cx) + Math.abs(y - cy) - half) * s);
}

function diamond(surf, cx, cy, half, rgb, alpha = 1) {
  surf.paint([cx - half - 2, cy - half - 2, cx + half + 2, cy + half + 2],
    diamondCoverage(cx, cy, half), rgb, alpha);
}

function diamondHole(surf, cx, cy, half) {
  surf.erase([cx - half - 2, cy - half - 2, cx + half + 2, cy + half + 2],
    diamondCoverage(cx, cy, half));
}

// ── The VisionGo mark ─────────────────────────────────────────────
//
// Scale-independent: pass the canvas center + a unit (u = canvas/1024).
// Layout in 1024-space: center medallion r≈155, orbit r≈330, dots r≈60.

function drawMark(surf, cx, cy, u, opts = {}) {
  const {
    dotCount = 8,
    withSpokes = true,
    withOrbit = true,
    monochrome = null, // rgb triple → silhouette mode
  } = opts;

  const orbitR = 330 * u;
  const dotR = 60 * u;
  const medR = 155 * u;

  const ink = hex(INK);

  // Faint orbit hairline behind everything
  if (withOrbit) ring(surf, cx, cy, orbitR, 3.5 * u, monochrome ?? ink, monochrome ? 1 : 0.16);

  // Spokes from medallion toward each dot
  if (withSpokes) {
    for (let i = 0; i < dotCount; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / dotCount;
      const x1 = cx + Math.cos(ang) * (medR + 26 * u);
      const y1 = cy + Math.sin(ang) * (medR + 26 * u);
      const x2 = cx + Math.cos(ang) * (orbitR - dotR - 18 * u);
      const y2 = cy + Math.sin(ang) * (orbitR - dotR - 18 * u);
      line(surf, x1, y1, x2, y2, 5 * u, monochrome ?? ink, monochrome ? 1 : 0.20);
    }
  }

  // Orbiting goal-note dots
  for (let i = 0; i < dotCount; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / dotCount;
    const x = cx + Math.cos(ang) * orbitR;
    const y = cy + Math.sin(ang) * orbitR;
    const rgb = monochrome ?? hex(NOTE_COLORS[i % NOTE_COLORS.length]);
    circle(surf, x, y, dotR, rgb);
    if (!monochrome) {
      // hairline rim a shade deeper for definition on pale backgrounds
      const rim = rgb.map((v) => Math.max(0, Math.round(v * 0.82)));
      ring(surf, x, y, dotR - 1.5 * u, 3 * u, rim, 0.55);
    }
  }

  // Center medallion: green disc + cream diamond (the ◈ year core)
  circle(surf, cx, cy, medR, monochrome ?? hex(ACCENT));
  if (monochrome) {
    diamondHole(surf, cx, cy, 80 * u);
  } else {
    ring(surf, cx, cy, medR - 10 * u, 4 * u, hex(CREAM), 0.35);
    diamond(surf, cx, cy, 80 * u, hex(CREAM));
  }
}

// ── PNG encoder (Node zlib + manual chunks) ───────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(rgba, w, h, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(h * (1 + w * channels));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * channels);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = row + 1 + x * channels;
      raw[o] = rgba[i]; raw[o + 1] = rgba[i + 1]; raw[o + 2] = rgba[i + 2];
      if (alpha) raw[o + 3] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;                    // bit depth
  ihdr[9] = alpha ? 6 : 2;        // color type: RGBA / RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function save(name, surf, opts) {
  const file = path.join(__dirname, '..', 'assets', name);
  fs.writeFileSync(file, encodePNG(surf.resolve(), surf.w, surf.h, opts));
  console.log(`✓ ${name} (${surf.w}×${surf.h}${opts && opts.alpha === false ? ', no alpha' : ''})`);
}

// ── Assets ────────────────────────────────────────────────────────

// 1. App icon — opaque warm-paper radial gradient, full mark.
{
  const s = new Surface(1024, 1024, 4);
  s.radialBackground(512, 460, hex(PAPER_LIGHT), hex(PAPER_DEEP), 780);
  drawMark(s, 512, 512, 1.09);
  save('icon.png', s, { alpha: false });
}

// 2. Android adaptive icon foreground — transparent, mark scaled into the
//    66% safe zone (background color comes from app.json).
{
  const s = new Surface(1024, 1024, 4);
  drawMark(s, 512, 512, 0.78);
  save('adaptive-icon.png', s, { alpha: true });
}

// 3. Splash mark — transparent square logo; expo-splash-screen sizes it via
//    imageWidth over the configured backgroundColor.
{
  const s = new Surface(1024, 1024, 4);
  drawMark(s, 512, 512, 1);
  save('splash.png', s, { alpha: true });
}

// 4. Favicon — simplified 4-dot mark so it stays legible at 16–32px.
{
  const s = new Surface(64, 64, 8);
  const u = 64 / 1024;
  const dotColors = [NOTE_COLORS[0], NOTE_COLORS[2], NOTE_COLORS[3], NOTE_COLORS[1]];
  const cx = 32, cy = 32;
  const orbitR = 340 * u * (64 / 78); // slightly tucked in
  const dotR = 92 * u;
  for (let i = 0; i < 4; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 2;
    circle(s, cx + Math.cos(ang) * orbitR, cy + Math.sin(ang) * orbitR, dotR, hex(dotColors[i]));
  }
  circle(s, cx, cy, 175 * u, hex(ACCENT));
  diamond(s, cx, cy, 92 * u, hex(CREAM));
  save('favicon.png', s, { alpha: true });
}

// 5. Android notification small icon — pure white silhouette on transparency
//    (Android tints it; color comes from the expo-notifications plugin).
{
  const s = new Surface(96, 96, 8);
  drawMark(s, 48, 48, 96 / 1024 * 1.16, {
    monochrome: [255, 255, 255],
    withOrbit: false,
    withSpokes: false,
  });
  save('notification-icon.png', s, { alpha: true });
}
