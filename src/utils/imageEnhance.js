// src/utils/imageEnhance.js
//
// Multi-pass "AI-style" photo enhancement, fully client-side.
//
// This is a classical pipeline — auto white-balance, tonal stretch, S-curve,
// local-contrast + detail unsharp mask, vibrance, optional 2× upscale.
// It produces a real, visible "Remini-ish" improvement (snap, clarity,
// micro-detail) but it is NOT a GAN-based face restorer. Heavily blurry
// faces won't be hallucinated back to sharpness — only an actual neural
// model can do that, which would require downloading 10+ MB of weights.
//
// All passes operate on a single shared ImageData in-place. Between passes
// we `yield()` to a microtask so the browser can paint progress and the
// user's cancel signal can be honoured.

// .js extension is required for Node ESM (smoke tests) and harmless under Vite.
import { applyUnsharpMask } from './imageAnalysis.js';

const STAGES = [
  { id: 'load',     label: 'Decoding image…',         weight: 0.08 },
  { id: 'wb',       label: 'Auto white balance…',      weight: 0.10 },
  { id: 'stretch',  label: 'Expanding tonal range…',   weight: 0.10 },
  { id: 'scurve',   label: 'Applying tonal curve…',    weight: 0.10 },
  { id: 'local',    label: 'Lifting local contrast…',  weight: 0.18 },
  { id: 'detail',   label: 'Sharpening details…',      weight: 0.20 },
  { id: 'vibrance', label: 'Enriching colour…',        weight: 0.08 },
  { id: 'upscale',  label: 'Upscaling (2×)…',          weight: 0.10 },
  { id: 'encode',   label: 'Encoding…',                weight: 0.06 },
];

const STRENGTH_PRESETS = {
  low: {
    sCurve: 0.10,
    localRadius: 18, localAmount: 0.25,
    detailRadius: 1, detailAmount: 0.6,
    vibrance: 0.10,
  },
  medium: {
    sCurve: 0.18,
    localRadius: 22, localAmount: 0.40,
    detailRadius: 1, detailAmount: 1.0,
    vibrance: 0.18,
  },
  high: {
    sCurve: 0.28,
    localRadius: 28, localAmount: 0.55,
    detailRadius: 1, detailAmount: 1.4,
    vibrance: 0.28,
  },
};

const yieldToBrowser = () =>
  new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

class EnhanceAbort extends Error {
  constructor() { super('Enhance cancelled'); this.name = 'EnhanceAbort'; }
}
/** Throw if the caller's cancel flag has flipped to true. */
function checkAbort(signal) {
  if (signal?.cancelled) throw new EnhanceAbort();
}

/**
 * Run the enhancement pipeline.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source — input image
 * @param {Object} options
 * @param {string}   options.strength    'low' | 'medium' | 'high'
 * @param {boolean}  options.upscale     2× output when true
 * @param {string}   options.preFilter   CSS filter string applied during the
 *                                       initial draw (bakes the user's
 *                                       brightness/contrast/etc. into pixels
 *                                       so the enhanced image stands alone)
 * @param {number}   options.maxWorkingSize  cap on max(width, height) used for
 *                                       processing. Default 2400 — bigger
 *                                       inputs are downscaled.
 * @param {(stage, frac) => void} options.onProgress
 * @param {{cancelled: boolean}}   options.signal  flip cancelled=true to abort
 *
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
export async function enhancePhoto(source, options = {}) {
  const {
    strength = 'medium',
    upscale = false,
    preFilter = 'none',
    maxWorkingSize = 2400,
    onProgress = () => {},
    signal = { cancelled: false },
  } = options;

  const preset = STRENGTH_PRESETS[strength] || STRENGTH_PRESETS.medium;

  // ── Stage 1: decode + downscale to working size ────────
  emit(onProgress, 'load', 0);
  const srcW = source.naturalWidth || source.width;
  const srcH = source.naturalHeight || source.height;
  if (!srcW || !srcH) throw new Error('Source image has no dimensions');

  const longSide = Math.max(srcW, srcH);
  const scale = longSide > maxWorkingSize ? maxWorkingSize / longSide : 1;
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = preFilter || 'none';
  ctx.drawImage(source, 0, 0, w, h);
  ctx.filter = 'none';

  emit(onProgress, 'load', 1);
  await yieldToBrowser(); checkAbort(signal);

  // Grab the pixel buffer once; every pass mutates it in place.
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  // ── Stage 2: auto white balance (grey-world) ────────────
  emit(onProgress, 'wb', 0);
  autoWhiteBalance(data);
  emit(onProgress, 'wb', 1);
  await yieldToBrowser(); checkAbort(signal);

  // ── Stage 3: black/white point stretch on luminance ─────
  emit(onProgress, 'stretch', 0);
  tonalStretch(data);
  emit(onProgress, 'stretch', 1);
  await yieldToBrowser(); checkAbort(signal);

  // ── Stage 4: S-curve contrast on each channel ───────────
  emit(onProgress, 'scurve', 0);
  applySCurve(data, preset.sCurve);
  emit(onProgress, 'scurve', 1);
  await yieldToBrowser(); checkAbort(signal);

  // ── Stage 5: local contrast (large-radius unsharp mask) ─
  // This is the "clarity" / "AI snap" pass — adds mid-frequency contrast
  // without amplifying noise the way a small-radius sharpen would.
  emit(onProgress, 'local', 0);
  ctx.putImageData(img, 0, 0);
  applyUnsharpMask(ctx, w, h, {
    radius: preset.localRadius,
    amount: preset.localAmount,
    threshold: 0,
  });
  const after = ctx.getImageData(0, 0, w, h);
  data.set(after.data);
  emit(onProgress, 'local', 1);
  await yieldToBrowser(); checkAbort(signal);

  // ── Stage 6: detail sharpen (small radius) ──────────────
  emit(onProgress, 'detail', 0);
  ctx.putImageData(img, 0, 0);
  applyUnsharpMask(ctx, w, h, {
    radius: preset.detailRadius,
    amount: preset.detailAmount,
    threshold: 3,    // skip flat regions — keeps noise down
  });
  const after2 = ctx.getImageData(0, 0, w, h);
  data.set(after2.data);
  emit(onProgress, 'detail', 1);
  await yieldToBrowser(); checkAbort(signal);

  // ── Stage 7: vibrance ───────────────────────────────────
  // Boosts saturation, but more strongly on muted pixels — leaves already-
  // saturated regions (skin tones in particular) closer to original.
  emit(onProgress, 'vibrance', 0);
  applyVibrance(data, preset.vibrance);
  emit(onProgress, 'vibrance', 1);
  ctx.putImageData(img, 0, 0);
  await yieldToBrowser(); checkAbort(signal);

  // ── Stage 8: optional 2× upscale ────────────────────────
  let outCv = cv;
  if (upscale) {
    emit(onProgress, 'upscale', 0);
    const upW = Math.min(8192, w * 2);
    const upH = Math.min(8192, h * 2);
    const up = document.createElement('canvas');
    up.width = upW; up.height = upH;
    const upCtx = up.getContext('2d', { willReadFrequently: true });
    upCtx.imageSmoothingEnabled = true;
    upCtx.imageSmoothingQuality = 'high';
    upCtx.drawImage(cv, 0, 0, upW, upH);
    // Re-sharpen post-upscale so the bicubic softness doesn't dominate.
    applyUnsharpMask(upCtx, upW, upH, {
      radius: 1,
      amount: 0.6,
      threshold: 3,
    });
    outCv = up;
    emit(onProgress, 'upscale', 1);
    await yieldToBrowser(); checkAbort(signal);
  } else {
    emit(onProgress, 'upscale', 1);
  }

  // ── Stage 9: encode ─────────────────────────────────────
  emit(onProgress, 'encode', 0);
  // PNG keeps the enhanced detail without recompression artefacts;
  // the user can still re-encode in the Export tab.
  const dataUrl = outCv.toDataURL('image/png');
  emit(onProgress, 'encode', 1);

  return { dataUrl, width: outCv.width, height: outCv.height };
}

export const ENHANCE_STAGES = STAGES;

// ── Pure passes (operate on Uint8ClampedArray in place) ───
// Each function is self-contained and testable from Node without a DOM.

/**
 * Grey-world white balance: pull each channel's mean toward the overall mean.
 * Robust to mild colour casts; aggressive cases (deep underwater, heavy
 * tungsten) need a proper illuminant estimator.
 */
export function autoWhiteBalance(data) {
  let rSum = 0, gSum = 0, bSum = 0;
  const px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
  }
  const rMean = rSum / px;
  const gMean = gSum / px;
  const bMean = bSum / px;
  const target = (rMean + gMean + bMean) / 3;
  // Avoid divide-by-zero on a black image.
  const rGain = rMean > 1 ? target / rMean : 1;
  const gGain = gMean > 1 ? target / gMean : 1;
  const bGain = bMean > 1 ? target / bMean : 1;
  // Clamp gains to avoid wild colour shifts on already-balanced images.
  const clampGain = (g) => Math.max(0.85, Math.min(1.15, g));
  const rG = clampGain(rGain), gG = clampGain(gGain), bG = clampGain(bGain);
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = clamp255(data[i]     * rG);
    data[i + 1] = clamp255(data[i + 1] * gG);
    data[i + 2] = clamp255(data[i + 2] * bG);
  }
}

/**
 * Find 0.5 / 99.5 percentile of luminance and remap that range to 0..255.
 * Skips the remap entirely if the image already fills > 92 % of the range
 * (so already-good photos don't get gratuitously crushed).
 */
export function tonalStretch(data) {
  const lum = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) | 0;
    lum[l < 0 ? 0 : l > 255 ? 255 : l]++;
  }
  const total = data.length / 4;
  const pct = (p) => {
    const target = total * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += lum[i];
      if (acc >= target) return i;
    }
    return 255;
  };
  const lo = pct(0.005);
  const hi = pct(0.995);
  const range = hi - lo;
  if (range <= 0 || range >= 235) return;   // already covers ~92% — leave alone

  const scale = 255 / range;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = clamp255((data[i]     - lo) * scale);
    data[i + 1] = clamp255((data[i + 1] - lo) * scale);
    data[i + 2] = clamp255((data[i + 2] - lo) * scale);
  }
}

/**
 * Smooth-step S-curve to add contrast without crushing shadows or highlights.
 * `amount` is 0..1; larger = punchier. Operates per-channel which gives a
 * slight saturation lift as a side-effect — desired here.
 */
export function applySCurve(data, amount) {
  if (amount <= 0) return;
  // Build a 256-entry lookup so we don't call the curve per-pixel.
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    // Symmetric S-curve around 0.5
    const s = 0.5 - 0.5 * Math.cos(Math.PI * x);  // smoothstep
    const y = x * (1 - amount) + s * amount;
    lut[i] = Math.round(y * 255);
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

/**
 * Vibrance: boost saturation more strongly on low-saturation pixels.
 * `amount` is 0..1 — at 1.0 a fully grey pixel gets pushed roughly halfway
 * to its hue (rare in practice; real photos have some chroma everywhere).
 */
export function applyVibrance(data, amount) {
  if (amount <= 0) return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;     // 0..1 HSV saturation
    // weight: low-sat pixels get the most boost
    const k = (1 - sat) * amount;
    const grey = (r + g + b) / 3;
    data[i]     = clamp255(grey + (r - grey) * (1 + k));
    data[i + 1] = clamp255(grey + (g - grey) * (1 + k));
    data[i + 2] = clamp255(grey + (b - grey) * (1 + k));
  }
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function emit(onProgress, stageId, frac) {
  const idx = STAGES.findIndex(s => s.id === stageId);
  if (idx < 0) return;
  // Cumulative progress = sum of completed stage weights + frac × current stage weight
  let done = 0;
  for (let i = 0; i < idx; i++) done += STAGES[i].weight;
  const total = STAGES.reduce((a, s) => a + s.weight, 0);
  const overall = (done + frac * STAGES[idx].weight) / total;
  onProgress({ stage: STAGES[idx], overall: Math.max(0, Math.min(1, overall)) });
}
