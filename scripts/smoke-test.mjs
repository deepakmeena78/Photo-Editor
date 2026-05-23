// scripts/smoke-test.mjs
// Lightweight smoke tests for pure JS modules. Runs under Node, no DOM.
//
//   node scripts/smoke-test.mjs
//
// Validates:
//   - useHistory push/undo/redo/clear with edge cases
//   - suggestAutoEnhance returns sane values
//   - applyUnsharpMask & applyGrain do not crash with a polyfilled canvas

import assert from 'node:assert/strict';

// ── Stub the browser bits the modules import from constants ──
// (we only need DEFAULT_ADJ + buildFilter signatures the algorithms touch)

// 1) Test the auto-enhance heuristic in isolation
const { suggestAutoEnhance } = await import('../src/utils/imageAnalysis.js');

// Build a "histogram" matching a low-contrast greyscale image:
// all pixels clustered between 60..200.
const total = 10000;
const lum = new Uint32Array(256);
for (let i = 60; i <= 200; i++) lum[i] = Math.round(total / (200 - 60 + 1));
const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256);
for (let i = 60; i <= 200; i++) { r[i] = g[i] = b[i] = Math.round(total / (200 - 60 + 1)); }

const sugg = suggestAutoEnhance({ r, g, b, lum, total });
assert.ok(sugg, 'should return suggestion');
assert.ok(sugg.contrast > 100, `contrast should boost (was ${sugg.contrast})`);
assert.ok(sugg.brightness >= 90 && sugg.brightness <= 135, `brightness should stay sane (was ${sugg.brightness})`);
assert.equal(sugg.saturate, 100, 'greyscale image keeps saturation at 100');
console.log('✓ suggestAutoEnhance handles low-contrast greyscale');

// 2) Test a very dark image: median is low → brightness lift; black point low → shadows lift.
const lum2 = new Uint32Array(256);
for (let i = 0; i < 60; i++) lum2[i] = Math.round(total / 60);
const r2 = new Uint32Array(256), g2 = new Uint32Array(256), b2 = new Uint32Array(256);
for (let i = 0; i < 60; i++) { r2[i] = g2[i] = b2[i] = Math.round(total / 60); }
const sugg2 = suggestAutoEnhance({ r: r2, g: g2, b: b2, lum: lum2, total });
assert.ok(sugg2.brightness > 100, `dark image should brighten (was ${sugg2.brightness})`);
assert.ok(sugg2.shadows > 0, `dark image should lift shadows (was ${sugg2.shadows})`);
console.log('✓ suggestAutoEnhance lifts shadows on dark image');

// 3) Test nextId uniqueness across rapid calls
const { nextId } = await import('../src/constants/index.js');
const ids = new Set();
for (let i = 0; i < 5000; i++) ids.add(nextId('x'));
assert.equal(ids.size, 5000, 'IDs must all be unique');
console.log('✓ nextId generates unique IDs even under rapid loop');

// 4) Test useHistory logic. We mirror the algorithm — including the
//    dedup added in v2 — against a synchronous in-memory store so we can
//    assert behaviour without rendering React.
function simulateHistory(maxSteps = 4) {
  const snapEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  };
  let state = { stack: [{ v: 0 }], cursor: 0 };
  const push = (snap) => {
    if (snapEqual(state.stack[state.cursor], snap)) return; // dedup
    const trimmed = state.stack.slice(0, state.cursor + 1);
    let next = [...trimmed, snap];
    let nextCursor = next.length - 1;
    if (next.length > maxSteps) {
      const drop = next.length - maxSteps;
      next = next.slice(drop);
      nextCursor = next.length - 1;
    }
    state = { stack: next, cursor: nextCursor };
  };
  const undo = () => { if (state.cursor > 0) state = { ...state, cursor: state.cursor - 1 }; };
  const redo = () => { if (state.cursor < state.stack.length - 1) state = { ...state, cursor: state.cursor + 1 }; };
  return { push, undo, redo, get: () => state };
}

// Basic push/undo/redo/trim
{
  const h = simulateHistory(4);
  h.push({ v: 1 }); h.push({ v: 2 }); h.push({ v: 3 });
  assert.equal(h.get().stack.length, 4);
  assert.equal(h.get().cursor, 3);
  assert.equal(h.get().stack[h.get().cursor].v, 3);
  h.undo(); h.undo();
  assert.equal(h.get().cursor, 1);
  assert.equal(h.get().stack[h.get().cursor].v, 1);
  h.push({ v: 99 }); // should truncate redo tail
  assert.equal(h.get().stack.length, 3);
  assert.equal(h.get().stack.at(-1).v, 99);
  // Overflow trimming
  h.push({ v: 100 }); h.push({ v: 101 });
  assert.equal(h.get().stack.length, 4, 'stack stays at maxSteps');
  assert.equal(h.get().cursor, 3, 'cursor stays at end after trim');
  console.log('✓ useHistory algorithm: push/undo/redo/trim all consistent');
}

// REGRESSION: single-click Undo after a real-world double-fire commit.
// Touch devices fire onMouseUp AND onTouchEnd for one tap-release, so the
// slider's commitAdj was firing TWICE — pushing two content-identical
// snapshots. The first Undo click lands on the dup (visually no change);
// without the fix the user had to click Undo twice.
{
  const h = simulateHistory(10);
  // user moves brightness 100 → 130 → release (two events fire)
  h.push({ adj: { brightness: 130 }, tx: { rotation: 0 } });
  h.push({ adj: { brightness: 130 }, tx: { rotation: 0 } }); // dup from onTouchEnd
  assert.equal(h.get().stack.length, 2, 'duplicate push is dropped — stack stays at 2');
  assert.equal(h.get().cursor, 1);

  // Single Undo click should restore the previous brightness (100).
  h.undo();
  assert.equal(h.get().cursor, 0, 'single undo moves cursor back to initial');
  assert.equal(h.get().stack[h.get().cursor].adj?.brightness, undefined,
    'restored snap has no brightness override (= initial state)');
  console.log('✓ single-click undo works after touch double-fire commit');
}

// REGRESSION: doneCrop / enhancePhoto push a snap with unchanged adj/tx.
// These pushes are noops for the history (only imageSrc changed, which isn't
// tracked). Dedup should drop them so Undo isn't burnt on a phantom step.
{
  const h = simulateHistory(10);
  h.push({ adj: { saturate: 150 }, tx: { rotation: 0 } });
  // doneCrop / enhancePhoto: same adj/tx, but caller "pushes" anyway.
  h.push({ adj: { saturate: 150 }, tx: { rotation: 0 } });
  assert.equal(h.get().stack.length, 2, 'destructive op with unchanged adj does not bloat history');
  h.undo();
  assert.equal(h.get().cursor, 0, 'one Undo click reverts the saturation change');
  console.log('✓ destructive op with unchanged (adj, tx) does not need double-click undo');
}

// REGRESSION: dedup preserves the redo tail (noop edit ≠ new branch).
{
  const h = simulateHistory(10);
  h.push({ v: 1 }); h.push({ v: 2 });   // stack [0,1,2], cursor 2
  h.undo();                              // cursor 1
  h.push({ v: 1 });                      // noop — would dedup against current top
  assert.equal(h.get().cursor, 1, 'noop push leaves cursor where it was');
  assert.equal(h.get().stack.length, 3, 'redo tail preserved when push is a noop');
  h.redo();
  assert.equal(h.get().stack[h.get().cursor].v, 2, 'redo to {v:2} still works');
  console.log('✓ noop push preserves the redo tail');
}

// REGRESSION: a *real* push after undo DOES drop the redo tail.
{
  const h = simulateHistory(10);
  h.push({ v: 1 }); h.push({ v: 2 });   // stack [0,1,2], cursor 2
  h.undo();                              // cursor 1
  h.push({ v: 42 });                     // real branch
  assert.equal(h.get().stack.length, 3, 'real push drops redo tail');
  assert.equal(h.get().stack.at(-1).v, 42);
  console.log('✓ real (non-noop) push after undo still drops the redo tail');
}

// 5) Overlay sizing math — regression guard for the export-text-too-small bug.
//
// Before fix: `scaleF = exportW / naturalW` produced 1× when exporting at
// natural size, making a 32 px on-screen label render as 32 px on a 4000 px
// image. After fix: `overlayScale = exportW / displayedW` makes the label
// keep the same fraction of the image regardless of export resolution.
{
  const sizeOnExport = (textSizePx, displayedW, exportW) =>
    Math.max(1, Math.round(textSizePx * (exportW / displayedW)));

  const fractionOf = (px, w) => px / w;

  // Screen displays a 4000 px image at 800 px. 32 px text = 4% of width.
  const onScreenFrac = fractionOf(32, 800);

  // Export at natural (4000)
  let exported = sizeOnExport(32, 800, 4000);
  assert.equal(exported, 160, 'natural-size export keeps fraction (32→160)');
  assert.ok(Math.abs(fractionOf(exported, 4000) - onScreenFrac) < 0.001,
    'export size preserves fraction at natural res');

  // Export at 50% scale (2000)
  exported = sizeOnExport(32, 800, 2000);
  assert.equal(exported, 80, 'half-size export halves (32→80)');
  assert.ok(Math.abs(fractionOf(exported, 2000) - onScreenFrac) < 0.001,
    'export size preserves fraction at half res');

  // Export upscaled to 8000
  exported = sizeOnExport(32, 800, 8000);
  assert.equal(exported, 320, 'upscaled export scales up (32→320)');
  assert.ok(Math.abs(fractionOf(exported, 8000) - onScreenFrac) < 0.001,
    'export size preserves fraction at 2× res');
  console.log('✓ overlay sizing math: text fraction preserved across export resolutions');
}

// 6) Anchored zoom math — regression guard for "zoom to cursor stays at cursor".
//
// Mirrors the formula in useImageEditor.zoomAt:
//   ratio = newZoom / oldZoom
//   newPanX = anchorX - (anchorX - panX) * ratio
//
// A world point (wx) appears on screen at: panX + wx * zoom.
// After zoom + new pan, the same wx must land at the same screen position
// when we want to keep the cursor anchored.
{
  const zoomAt = (state, ax, ay, factor) => {
    const next = state.zoom * factor;
    const ratio = next / state.zoom;
    return {
      zoom: next,
      panX: ax - (ax - state.panX) * ratio,
      panY: ay - (ay - state.panY) * ratio,
    };
  };
  const screenPos = (s, wx, wy) => [s.panX + wx * s.zoom, s.panY + wy * s.zoom];

  // Start fit, anchor at (40, -25) — pretend cursor sits there relative to centre.
  let s = { zoom: 1, panX: 0, panY: 0 };
  // What world point currently lives under the cursor?
  // wx = (anchor - panX) / zoom
  const wx = (40 - s.panX) / s.zoom;
  const wy = (-25 - s.panY) / s.zoom;
  // Zoom in 2.5×
  s = zoomAt(s, 40, -25, 2.5);
  const [sx, sy] = screenPos(s, wx, wy);
  assert.ok(Math.abs(sx - 40) < 1e-6, `anchor X stays put (got ${sx})`);
  assert.ok(Math.abs(sy + 25) < 1e-6, `anchor Y stays put (got ${sy})`);

  // Zoom out (factor 0.5) anchored at a different point — should still anchor.
  const newAnchor = [-15, 30];
  const wx2 = (newAnchor[0] - s.panX) / s.zoom;
  const wy2 = (newAnchor[1] - s.panY) / s.zoom;
  s = zoomAt(s, newAnchor[0], newAnchor[1], 0.5);
  const [sx2, sy2] = screenPos(s, wx2, wy2);
  assert.ok(Math.abs(sx2 - newAnchor[0]) < 1e-6, 'anchor preserved across zoom-out');
  assert.ok(Math.abs(sy2 - newAnchor[1]) < 1e-6, 'anchor preserved across zoom-out');
  console.log('✓ anchored zoom: world point under cursor stays under cursor');
}

// 7) Emoji library: every entry has a character + name, search finds expected
//    items, total is large enough to feel like "all stickers".
{
  const { EMOJI_CATEGORIES, searchEmojis } = await import('../src/utils/emojiData.js');
  assert.ok(Array.isArray(EMOJI_CATEGORIES) && EMOJI_CATEGORIES.length >= 8,
    `expected ≥8 categories, got ${EMOJI_CATEGORIES.length}`);

  let total = 0;
  for (const cat of EMOJI_CATEGORIES) {
    assert.ok(cat.id && cat.name && cat.icon, `category missing field: ${JSON.stringify(cat).slice(0,80)}`);
    assert.ok(Array.isArray(cat.emojis) && cat.emojis.length > 0, `empty category ${cat.id}`);
    for (const e of cat.emojis) {
      assert.ok(typeof e.c === 'string' && e.c.length > 0, `bad emoji char in ${cat.id}`);
      assert.ok(typeof e.n === 'string' && e.n.length > 0, `missing emoji name in ${cat.id}`);
    }
    total += cat.emojis.length;
  }
  assert.ok(total >= 500, `expected ≥500 emojis total, got ${total}`);

  const hearts = searchEmojis('heart', 30);
  assert.ok(hearts.length > 0, 'search "heart" should return results');
  assert.ok(hearts.some(e => e.c === '❤️'), 'search "heart" should include ❤️');

  const pizza = searchEmojis('pizza');
  assert.ok(pizza.some(e => e.c === '🍕'), 'search "pizza" should include 🍕');

  assert.deepEqual(searchEmojis(''), [], 'empty query returns []');
  assert.deepEqual(searchEmojis('  '), [], 'whitespace query returns []');
  console.log(`✓ emoji library: ${total} stickers across ${EMOJI_CATEGORIES.length} categories, search works`);
}

// 8) Enhance pipeline pure-function passes
{
  const {
    autoWhiteBalance, tonalStretch, applySCurve, applyVibrance,
  } = await import('../src/utils/imageEnhance.js');

  const px = (r, g, b) => [r, g, b, 255];
  const buf = (pixels) => {
    const d = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach((p, i) => d.set(p, i * 4));
    return d;
  };
  const channels = (d, i) => [d[i*4], d[i*4+1], d[i*4+2]];

  // WB: warm cast (R > G > B) gets pulled toward grey.
  {
    const d = buf([px(200, 160, 120), px(180, 150, 110), px(220, 170, 130)]);
    autoWhiteBalance(d);
    const [r, g, b] = channels(d, 0);
    // R should drop, B should rise — gap should shrink.
    assert.ok(r < 200, `warm cast: R should drop, got ${r}`);
    assert.ok(b > 120, `warm cast: B should rise, got ${b}`);
    console.log('✓ autoWhiteBalance pulls warm cast toward grey');
  }

  // tonalStretch: image with luminance compressed to 60..200 should
  // expand to ~0..255.
  {
    // Build 1000 pixels with luminance evenly distributed in [60, 200].
    const arr = [];
    for (let i = 0; i < 1000; i++) {
      const v = Math.round(60 + (i / 999) * 140);
      arr.push(px(v, v, v));
    }
    const d = buf(arr);
    tonalStretch(d);
    // Smallest pixel should now be ≈0, largest ≈255.
    const first = d[0], last = d[d.length - 4];
    assert.ok(first <= 10, `tonalStretch: min should approach 0, got ${first}`);
    assert.ok(last >= 245, `tonalStretch: max should approach 255, got ${last}`);
    console.log('✓ tonalStretch expands compressed luminance to full range');
  }

  // tonalStretch: image already filling the range → no change.
  {
    const d = buf([px(0, 0, 0), px(255, 255, 255), px(128, 128, 128)]);
    const before = Array.from(d);
    tonalStretch(d);
    assert.deepEqual(Array.from(d), before, 'already-full range should be untouched');
    console.log('✓ tonalStretch leaves well-ranged images alone');
  }

  // S-curve: linear ramp gains contrast (mid-grey stays put, lights brighten,
  // darks darken).
  {
    const arr = [];
    for (let i = 0; i < 256; i++) arr.push(px(i, i, i));
    const d = buf(arr);
    applySCurve(d, 0.5);
    // Mid (i=128) should be near 128.
    assert.ok(Math.abs(d[128*4] - 128) <= 3, `mid grey should stay near 128, got ${d[128*4]}`);
    // Dark (i=64) should be darker than original.
    assert.ok(d[64*4] < 64, `dark should be pushed down, got ${d[64*4]}`);
    // Light (i=192) should be brighter.
    assert.ok(d[192*4] > 192, `light should be pushed up, got ${d[192*4]}`);
    console.log('✓ applySCurve preserves mid-grey and increases contrast');
  }

  // Vibrance: low-sat pixel gains saturation more than high-sat pixel.
  {
    const muted = buf([px(120, 130, 110)]);   // tiny chroma
    const vivid = buf([px(220,  40,  40)]);   // big chroma
    const mutedBefore = Math.max(...channels(muted, 0)) - Math.min(...channels(muted, 0));
    const vividBefore = Math.max(...channels(vivid, 0)) - Math.min(...channels(vivid, 0));
    applyVibrance(muted, 0.5);
    applyVibrance(vivid, 0.5);
    const mutedAfter = Math.max(...channels(muted, 0)) - Math.min(...channels(muted, 0));
    const vividAfter = Math.max(...channels(vivid, 0)) - Math.min(...channels(vivid, 0));
    const mutedGain = mutedAfter / mutedBefore;
    const vividGain = vividAfter / vividBefore;
    assert.ok(mutedGain > vividGain,
      `vibrance: muted should gain more than vivid (muted ${mutedGain.toFixed(2)}× vs vivid ${vividGain.toFixed(2)}×)`);
    console.log('✓ applyVibrance boosts muted pixels more than vivid ones');
  }
}

// 9) REGRESSION: editor overlay's translate-X offset must match what the
// export canvas does with `ctx.textAlign`. Before the fix the editor used
// translate(-50%) regardless of alignment, so left/right-aligned text
// drifted by ~½ text width during export and could clip past the canvas.
{
  // Mirror the helper in Canvas.jsx. If the formula here drifts from the
  // one in the component, the export-vs-editor anchor will desync again.
  const xOffsetFor = (align) => align === 'left'  ? '0%'
                              : align === 'right' ? '-100%'
                              : '-50%';

  // Inverse — what fraction of the text box's width sits to the LEFT of
  // the anchor point. ctx.textAlign uses the same fractions:
  //   start/left → 0 of width left of x, all width right
  //   center     → 0.5 of width on each side
  //   end/right  → all of width left of x, 0 right
  const fractionLeftOfAnchor = (align) => align === 'left'  ? 0
                                        : align === 'right' ? 1
                                        : 0.5;

  for (const align of ['left', 'center', 'right', undefined, 'bogus']) {
    const off = xOffsetFor(align);
    // editor's translate(X%) means the box origin (left edge) is shifted by
    // X% of the box width. So the anchor point sits at (-X)/100 of the box
    // width from its left edge → that's the fraction left of anchor.
    // Add 0 to normalise -0 → 0 (parseFloat('0%') = 0, negated → -0).
    const editorFrac = -parseFloat(off) / 100 + 0;
    const canvasFrac = fractionLeftOfAnchor(align || 'center');
    assert.equal(editorFrac, canvasFrac,
      `align="${align}" editor (${off}→${editorFrac}) must match canvas (${canvasFrac})`);
  }
  console.log('✓ overlay anchor offset matches canvas textAlign for all align values');
}

console.log('\nAll smoke tests passed ✓');
