// src/utils/imageAnalysis.js
// Pixel-level analysis & filter algorithms used for Auto-Enhance,
// Histogram display, unsharp-mask sharpening and on-canvas grain.

/**
 * Build a 256-bin histogram for R, G, B and luminance.
 * Samples the image at a stride so very large images stay fast.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {number} maxDim — cap the working size to keep this O(1) per image
 * @returns {{ r:Uint32Array, g:Uint32Array, b:Uint32Array, lum:Uint32Array, total:number }}
 */
export function computeHistogram(source, maxDim = 256) {
  if (!source) return null;
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) return null;

  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);

  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // Tainted canvas (cross-origin image). Caller should handle null.
    return null;
  }

  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const lum = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    const rv = data[i];
    const gv = data[i + 1];
    const bv = data[i + 2];
    r[rv]++; g[gv]++; b[bv]++;
    // Rec. 709 luma
    const l = (rv * 0.2126 + gv * 0.7152 + bv * 0.0722) | 0;
    lum[Math.min(255, l)]++;
  }

  return { r, g, b, lum, total: (data.length / 4) | 0 };
}

/**
 * Suggest adjustment values that stretch the tonal range and gently
 * lift colour. Returns deltas relative to DEFAULT_ADJ (brightness 100,
 * contrast 100, saturate 100, the rest 0), not absolute slider values.
 *
 * Heuristic:
 *   - find 0.5 / 99.5 percentile of luminance for black/white points
 *   - boost contrast to expand that range
 *   - shift brightness toward mid-grey
 *   - small saturation bump if image is undersaturated
 */
export function suggestAutoEnhance(hist) {
  if (!hist) return null;
  const { lum, r, g, b, total } = hist;

  const pct = (arr, p) => {
    const target = total * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += arr[i];
      if (acc >= target) return i;
    }
    return 255;
  };

  const blackPt = pct(lum, 0.005);
  const whitePt = pct(lum, 0.995);
  const range   = Math.max(1, whitePt - blackPt);

  // Contrast: how much we need to stretch the histogram to fill 0..255.
  // 255 / range = the gain; convert to CSS-percent scale (100 = no change).
  const contrastGain = Math.min(1.8, 255 / range);
  const contrast = Math.round(Math.max(85, Math.min(165, contrastGain * 100)));

  // Brightness: where is the median? Shift toward 128.
  const median = pct(lum, 0.5);
  const brightDelta = Math.max(-25, Math.min(35, (128 - median) * 0.35));
  const brightness = Math.round(100 + brightDelta);

  // Saturation: low avg chroma → boost a bit.
  let avgR = 0, avgG = 0, avgB = 0;
  for (let i = 0; i < 256; i++) {
    avgR += r[i] * i;
    avgG += g[i] * i;
    avgB += b[i] * i;
  }
  avgR /= total; avgG /= total; avgB /= total;
  const meanChan = (avgR + avgG + avgB) / 3;
  const chroma   = (Math.abs(avgR - meanChan) + Math.abs(avgG - meanChan) + Math.abs(avgB - meanChan)) / 3;
  // chroma ~0 means greyscale, ~40+ means already very saturated.
  const sat = chroma < 8
    ? 100  // looks intentionally B&W — leave it alone
    : Math.round(Math.max(95, Math.min(135, 100 + (18 - chroma) * 1.6)));

  // Lift shadows a touch if blacks are crushed.
  const shadows = blackPt < 18 ? Math.round(Math.min(28, (18 - blackPt) * 1.2)) : 0;
  // Recover highlights if blown.
  const highlights = whitePt > 245 ? Math.round(Math.max(-22, -(whitePt - 245) * 1.5)) : 0;

  return {
    brightness,
    contrast,
    saturate: sat,
    shadows,
    highlights,
    vibrance: Math.max(0, Math.min(25, 22 - Math.round(chroma / 2))),
    clarity: 12,
  };
}

/**
 * Apply unsharp mask to an existing canvas in-place.
 *  - radius:  blur kernel radius in px (1..3 typical)
 *  - amount:  0..2 — gain on the high-frequency layer
 *  - threshold: 0..255 — only sharpen where |orig - blur| > threshold
 *
 * Implementation: box-blur approximation (3 passes ~= gaussian), then
 * pixel-wise add (orig - blur) * amount.
 */
export function applyUnsharpMask(ctx, w, h, { radius = 1, amount = 0.8, threshold = 4 } = {}) {
  if (amount <= 0) return;
  const src = ctx.getImageData(0, 0, w, h);
  const blurred = new Uint8ClampedArray(src.data);
  boxBlurRGBA(blurred, w, h, Math.max(1, radius | 0));
  boxBlurRGBA(blurred, w, h, Math.max(1, radius | 0));

  const out = src.data;
  for (let i = 0; i < out.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const o = out[i + c];
      const b2 = blurred[i + c];
      const diff = o - b2;
      if (Math.abs(diff) > threshold) {
        const v = o + diff * amount;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  ctx.putImageData(src, 0, 0);
}

/** Simple in-place box blur over RGBA — horizontal then vertical. */
function boxBlurRGBA(data, w, h, r) {
  const tmp = new Uint8ClampedArray(data.length);
  const win = r * 2 + 1;

  // Horizontal pass: data -> tmp
  for (let y = 0; y < h; y++) {
    let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
    const row = y * w * 4;
    for (let i = -r; i <= r; i++) {
      const x = i < 0 ? 0 : i >= w ? w - 1 : i;
      const idx = row + x * 4;
      sumR += data[idx]; sumG += data[idx + 1]; sumB += data[idx + 2]; sumA += data[idx + 3];
    }
    for (let x = 0; x < w; x++) {
      const idx = row + x * 4;
      tmp[idx]     = sumR / win;
      tmp[idx + 1] = sumG / win;
      tmp[idx + 2] = sumB / win;
      tmp[idx + 3] = sumA / win;
      const outX = x - r;
      const inX  = x + r + 1;
      const outIdx = row + (outX < 0 ? 0 : outX) * 4;
      const inIdx  = row + (inX >= w ? w - 1 : inX) * 4;
      sumR += data[inIdx]     - data[outIdx];
      sumG += data[inIdx + 1] - data[outIdx + 1];
      sumB += data[inIdx + 2] - data[outIdx + 2];
      sumA += data[inIdx + 3] - data[outIdx + 3];
    }
  }

  // Vertical pass: tmp -> data
  for (let x = 0; x < w; x++) {
    let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
    for (let i = -r; i <= r; i++) {
      const y = i < 0 ? 0 : i >= h ? h - 1 : i;
      const idx = (y * w + x) * 4;
      sumR += tmp[idx]; sumG += tmp[idx + 1]; sumB += tmp[idx + 2]; sumA += tmp[idx + 3];
    }
    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4;
      data[idx]     = sumR / win;
      data[idx + 1] = sumG / win;
      data[idx + 2] = sumB / win;
      data[idx + 3] = sumA / win;
      const outY = y - r;
      const inY  = y + r + 1;
      const outIdx = ((outY < 0 ? 0 : outY) * w + x) * 4;
      const inIdx  = ((inY >= h ? h - 1 : inY) * w + x) * 4;
      sumR += tmp[inIdx]     - tmp[outIdx];
      sumG += tmp[inIdx + 1] - tmp[outIdx + 1];
      sumB += tmp[inIdx + 2] - tmp[outIdx + 2];
      sumA += tmp[inIdx + 3] - tmp[outIdx + 3];
    }
  }
}

/** Apply film-grain noise in-place. strength 0..1. */
export function applyGrain(ctx, w, h, strength) {
  if (strength <= 0) return;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const k = strength * 60; // peak amplitude
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * k;
    data[i]     = clamp255(data[i]     + n);
    data[i + 1] = clamp255(data[i + 1] + n);
    data[i + 2] = clamp255(data[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Read the color of a single pixel at (xPct, yPct) on the displayed image.
 * Returns "#rrggbb" or null if the canvas is tainted.
 */
export function samplePixel(imgEl, xPct, yPct) {
  if (!imgEl) return null;
  const w = imgEl.naturalWidth, h = imgEl.naturalHeight;
  if (!w || !h) return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imgEl, 0, 0);
  let px;
  try {
    px = ctx.getImageData(
      Math.max(0, Math.min(w - 1, Math.round(w * xPct / 100))),
      Math.max(0, Math.min(h - 1, Math.round(h * yPct / 100))),
      1, 1,
    ).data;
  } catch {
    return null;
  }
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(px[0])}${toHex(px[1])}${toHex(px[2])}`;
}
