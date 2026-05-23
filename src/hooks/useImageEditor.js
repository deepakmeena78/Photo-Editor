// src/hooks/useImageEditor.js
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useHistory from './useHistory';
import {
  DEFAULT_ADJ, buildFilter, buildVignette,
  EXPORT_FORMATS, nextId,
} from '../constants';
import {
  computeHistogram, suggestAutoEnhance,
  applyUnsharpMask, applyGrain, samplePixel,
} from '../utils/imageAnalysis';
import { enhancePhoto as runEnhancePipeline } from '../utils/imageEnhance';

// ── Snapshot shape ──────────────────────────────────────────
const makeSnap = (adj, tx) => ({ adj: { ...adj }, tx: { ...tx } });
const DEFAULT_TX = { rotation: 0, flipX: 1, flipY: 1, zoom: 1, straighten: 0, panX: 0, panY: 0 };
const DEFAULT_ADJ_STR = JSON.stringify(DEFAULT_ADJ);

// ═══════════════════════════════════════════════════════════
export default function useImageEditor() {
  // ── App lifecycle ─────────────────────────────────────────
  const [loading, setLoading]       = useState(true);

  // ── Image sources ─────────────────────────────────────────
  const [imageSrc, setImageSrc]     = useState(null);
  const [origSrc,  setOrigSrc]      = useState(null);
  const [fileName, setFileName]     = useState('');
  const [fileSize, setFileSize]     = useState(0);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });

  // ── Adjustments & transform ──────────────────────────────
  const [adj, setAdj] = useState({ ...DEFAULT_ADJ });
  const [tx,  setTx]  = useState({ ...DEFAULT_TX });

  // ── Crop ──────────────────────────────────────────────────
  const [isCropping, setIsCropping] = useState(false);
  const [cropW, setCropW]           = useState('');
  const [cropH, setCropH]           = useState('');
  const [activeRatio, setActiveRatio] = useState('Free');

  // ── Overlays ──────────────────────────────────────────────
  const [texts,    setTexts]        = useState([]);
  const [stickers, setStickers]     = useState([]);
  // { type: 'text'|'sticker', id } | null — lifted out of Canvas so
  // panels can edit the selected layer in-place.
  const [activeLayer, setActiveLayer] = useState(null);

  // ── Frame & export ────────────────────────────────────────
  const [frame, setFrame] = useState({ type: 'none', width: 20 });
  const [exportFmt,     setExportFmt]     = useState('png');
  const [exportQuality, setExportQuality] = useState(92);
  const [exportScale,   setExportScale]   = useState(100);
  const [exportWidth,   setExportWidth]   = useState(0);  // 0 = auto from scale
  const [exportHeight,  setExportHeight]  = useState(0);
  const [resizeMode,    setResizeMode]    = useState('scale'); // 'scale' | 'pixels'

  // ── UI state ──────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState('Light');
  const [activeFilter,  setActiveFilter]  = useState('Original');
  const [showBefore,    setShowBefore]    = useState(false);
  const [showGrid,      setShowGrid]      = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);
  const [toastMsg,      setToastMsg]      = useState('');

  // ── Eyedropper ────────────────────────────────────────────
  const [eyedropper, setEyedropper] = useState(null); // null | { color }
  const [pickerActive, setPickerActive] = useState(false);

  // ── Enhance Photo (AI-style pipeline) ─────────────────────
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceProgress, setEnhanceProgress] = useState({ overall: 0, label: '' });
  const enhanceSignalRef = useRef(null);

  // ── History ───────────────────────────────────────────────
  const hist = useHistory(makeSnap(DEFAULT_ADJ, DEFAULT_TX));

  // ── Refs ──────────────────────────────────────────────────
  const fileRef    = useRef(null);
  const imgRef     = useRef(null);
  const cropperRef = useRef(null);
  const toastTimerRef = useRef(null);
  const histCursorRef = useRef(0);     // tracks last applied cursor

  // ── Loading ───────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(t);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (cropperRef.current) {
        try { cropperRef.current.destroy(); } catch { /* noop */ }
        cropperRef.current = null;
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  // ── Crop dimension inputs ─────────────────────────────────
  useEffect(() => {
    if (!cropperRef.current || !isCropping) return;
    const w = parseInt(cropW); if (w > 0) cropperRef.current.setCropBoxData({ width: w });
  }, [cropW, isCropping]);

  useEffect(() => {
    if (!cropperRef.current || !isCropping) return;
    const h = parseInt(cropH); if (h > 0) cropperRef.current.setCropBoxData({ height: h });
  }, [cropH, isCropping]);

  // ── Toast helper (single-flight, cleanup-safe) ───────────
  const toast = useCallback((msg, ms = 2000) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMsg(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMsg('');
      toastTimerRef.current = null;
    }, ms);
  }, []);

  // ── Push to history ───────────────────────────────────────
  const pushHistory = useCallback((newAdj, newTx) => {
    hist.push(makeSnap(newAdj, newTx));
  }, [hist]);

  // ── Sync from history only when the user navigates ───────
  // The previous version re-synced on every snapshot push, which
  // overwrote the user's live slider drag. Now we only sync when
  // the cursor moves (undo/redo/clear), never on push.
  const currentSnap = hist.current;
  useEffect(() => {
    if (!currentSnap) return;
    setAdj({ ...currentSnap.adj });
    setTx({ ...currentSnap.tx });
  }, [currentSnap]);

  // ── File load ─────────────────────────────────────────────
  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Unsupported file type ✗');
      return;
    }
    setFileName(file.name);
    setFileSize(file.size);
    const reader = new FileReader();
    reader.onerror = () => toast('Failed to read file ✗');
    reader.onload = (ev) => {
      const src = ev.target.result;
      setImageSrc(src);
      setOrigSrc(src);
      const freshAdj = { ...DEFAULT_ADJ };
      const freshTx  = { ...DEFAULT_TX };
      setAdj(freshAdj);
      setTx(freshTx);
      setTexts([]); setStickers([]);
      setActiveLayer(null);
      setActiveFilter('Original');
      setActiveTab('Light');
      setIsCropping(false);
      setFrame({ type: 'none', width: 20 });
      setExportWidth(0);
      setExportHeight(0);
      hist.clear(makeSnap(freshAdj, freshTx));
      if (cropperRef.current) { cropperRef.current.destroy(); cropperRef.current = null; }
      const img = new Image();
      img.onload = () => {
        setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setExportWidth(img.naturalWidth);
        setExportHeight(img.naturalHeight);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [hist, toast]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handleFile({ target: { files: [file] } });
  }, [handleFile]);

  // ── Adjustment change (live preview, no history push) ────
  const changeAdj = useCallback((key, val) => {
    setAdj(p => ({ ...p, [key]: val }));
    setActiveFilter('Custom');
  }, []);

  // ── Commit adj to history (on slider release) ─────────────
  const commitAdj = useCallback((key, val) => {
    setAdj(p => {
      const next = { ...p, [key]: val };
      pushHistory(next, tx);
      return next;
    });
  }, [tx, pushHistory]);

  // ── Apply full preset ─────────────────────────────────────
  const applyPreset = useCallback((preset) => {
    setActiveFilter(preset.name);
    const na = { ...DEFAULT_ADJ, ...preset.values };
    setAdj(na);
    pushHistory(na, tx);
  }, [tx, pushHistory]);

  // ── Auto Enhance ──────────────────────────────────────────
  const autoEnhance = useCallback(() => {
    if (!imgRef.current) return;
    try {
      const hist2 = computeHistogram(imgRef.current);
      if (!hist2) {
        toast('Cannot analyze image (tainted) ✗');
        return;
      }
      const sugg = suggestAutoEnhance(hist2);
      if (!sugg) return;
      const na = { ...DEFAULT_ADJ, ...sugg };
      setAdj(na);
      setActiveFilter('Auto Enhance');
      pushHistory(na, tx);
      toast('Auto enhance applied ✓');
    } catch (err) {
      console.error(err);
      toast('Auto enhance failed ✗');
    }
  }, [tx, pushHistory, toast]);

  // ── Enhance Photo (destructive pixel-baking pipeline) ────
  //
  // Bakes the user's current adjustments AND a multi-pass enhancement into a
  // new image, then replaces `imageSrc` so subsequent edits start from the
  // improved pixels. Adjustments are reset to defaults afterwards so the CSS
  // filter doesn't double-apply on top of the already-enhanced result.
  //
  // Reset (which restores origSrc) is the way to undo this; the action is
  // intentionally not stored in the undo stack because that would mean
  // keeping a full image bitmap per history step.
  const enhancePhoto = useCallback(async ({ strength = 'medium', upscale = false } = {}) => {
    if (!imgRef.current || !imageSrc || isEnhancing) return;
    setIsEnhancing(true);
    setEnhanceProgress({ overall: 0, label: 'Starting…' });
    const signal = { cancelled: false };
    enhanceSignalRef.current = signal;

    try {
      const result = await runEnhancePipeline(imgRef.current, {
        strength,
        upscale,
        preFilter: buildFilter(adj),     // bake the user's current sliders
        signal,
        onProgress: ({ stage, overall }) => {
          setEnhanceProgress({ overall, label: stage.label });
        },
      });

      setImageSrc(result.dataUrl);
      setImgNatural({ w: result.width, h: result.height });
      setExportWidth(result.width);
      setExportHeight(result.height);

      // The enhancement is now baked into pixels; reset CSS-filter adjustments
      // so they don't compound on top.
      const fresh = { ...DEFAULT_ADJ };
      setAdj(fresh);
      setActiveFilter('Enhanced');
      pushHistory(fresh, tx);
      toast(`Enhanced (${strength}${upscale ? ', 2×' : ''}) ✓`);
    } catch (err) {
      if (err && err.name === 'EnhanceAbort') {
        toast('Enhance cancelled');
      } else {
        console.error('Enhance failed', err);
        toast('Enhance failed ✗');
      }
    } finally {
      enhanceSignalRef.current = null;
      setIsEnhancing(false);
      setEnhanceProgress({ overall: 0, label: '' });
    }
  }, [imageSrc, isEnhancing, adj, tx, pushHistory, toast]);

  const cancelEnhance = useCallback(() => {
    if (enhanceSignalRef.current) enhanceSignalRef.current.cancelled = true;
  }, []);

  // ── Transform helpers ─────────────────────────────────────
  const rotate = useCallback((dir) => {
    setTx(p => {
      const next = { ...p, rotation: p.rotation + dir * 90 };
      pushHistory(adj, next);
      return next;
    });
  }, [adj, pushHistory]);

  const flip = useCallback((axis) => {
    setTx(p => {
      const next = axis === 'x'
        ? { ...p, flipX: p.flipX * -1 }
        : { ...p, flipY: p.flipY * -1 };
      pushHistory(adj, next);
      return next;
    });
  }, [adj, pushHistory]);

  // View transform (zoom / pan) — view-only, never pushed to history.
  // Pan auto-resets to (0,0) whenever the user returns to fit (zoom ≤ 1)
  // so the image is always centred at default zoom.
  const setZoom = useCallback((val) => {
    setTx(p => {
      const nextZoom = typeof val === 'function' ? val(p.zoom) : val;
      const clamped = Math.max(0.2, Math.min(4, nextZoom));
      if (clamped <= 1.001) {
        return { ...p, zoom: clamped, panX: 0, panY: 0 };
      }
      return { ...p, zoom: clamped };
    });
  }, []);

  const panBy = useCallback((dx, dy, bounds) => {
    setTx(p => {
      if (p.zoom <= 1.001) return p; // nothing to pan when fit
      let nx = p.panX + dx;
      let ny = p.panY + dy;
      if (bounds) {
        const { maxX, maxY } = bounds;
        nx = Math.max(-maxX, Math.min(maxX, nx));
        ny = Math.max(-maxY, Math.min(maxY, ny));
      }
      return { ...p, panX: nx, panY: ny };
    });
  }, []);

  /**
   * Zoom while keeping the world-point under (anchorX, anchorY) fixed.
   * Anchor coords are offsets from the image's screen-space centre.
   * Pass bounds to clamp pan after the zoom adjustment.
   */
  const zoomAt = useCallback((anchorX, anchorY, factor, bounds) => {
    setTx(p => {
      const next = Math.max(0.2, Math.min(4, p.zoom * factor));
      if (Math.abs(next - p.zoom) < 1e-4) return p;
      // Solve for the new pan so the cursor anchor stays put:
      //   anchorX = panX + worldX * zoom  →  worldX = (anchorX - panX) / zoom
      //   newPanX = anchorX - worldX * newZoom
      const ratio = next / p.zoom;
      let nx = anchorX - (anchorX - p.panX) * ratio;
      let ny = anchorY - (anchorY - p.panY) * ratio;
      if (next <= 1.001) { nx = 0; ny = 0; }
      else if (bounds) {
        const { maxX, maxY } = bounds;
        nx = Math.max(-maxX, Math.min(maxX, nx));
        ny = Math.max(-maxY, Math.min(maxY, ny));
      }
      return { ...p, zoom: next, panX: nx, panY: ny };
    });
  }, []);

  const resetView = useCallback(() => {
    setTx(p => ({ ...p, zoom: 1, panX: 0, panY: 0 }));
  }, []);

  // ── Crop ──────────────────────────────────────────────────
  const startCrop = useCallback(() => {
    if (!imgRef.current || !imageSrc) return;
    const Crop = window.Cropper;
    if (!Crop) {
      toast('Cropper.js failed to load ✗', 3000);
      return;
    }
    if (cropperRef.current) cropperRef.current.destroy();
    try {
      cropperRef.current = new Crop(imgRef.current, {
        viewMode: 1, responsive: true, autoCropArea: 0.8,
        movable: true, zoomable: true, rotatable: true,
        guides: true, center: true, background: false,
      });
      setIsCropping(true);
    } catch (err) {
      console.error(err);
      toast('Failed to start crop ✗');
    }
  }, [imageSrc, toast]);

  const doneCrop = useCallback(() => {
    if (!cropperRef.current) return;
    try {
      const cv = cropperRef.current.getCroppedCanvas({
        maxWidth: 8192, maxHeight: 8192,
        imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
      });
      cropperRef.current.destroy(); cropperRef.current = null;
      const newSrc = cv.toDataURL();
      setImageSrc(newSrc);
      setImgNatural({ w: cv.width, h: cv.height });
      setExportWidth(cv.width);
      setExportHeight(cv.height);
      setIsCropping(false);
      pushHistory(adj, tx);
      toast('Crop applied ✓');
    } catch (err) {
      console.error(err);
      toast('Crop failed ✗');
    }
  }, [adj, tx, pushHistory, toast]);

  const cancelCrop = useCallback(() => {
    if (cropperRef.current) { cropperRef.current.destroy(); cropperRef.current = null; }
    setIsCropping(false);
  }, []);

  const setAspectRatio = useCallback((ar) => {
    setActiveRatio(ar.label);
    if (cropperRef.current) cropperRef.current.setAspectRatio(isNaN(ar.ratio) ? NaN : ar.ratio);
  }, []);

  // ── Reset all ─────────────────────────────────────────────
  const resetAll = useCallback(() => {
    if (cropperRef.current) { cropperRef.current.destroy(); cropperRef.current = null; }
    const freshAdj = { ...DEFAULT_ADJ };
    const freshTx  = { ...DEFAULT_TX };
    setAdj(freshAdj); setTx(freshTx);
    setTexts([]); setStickers([]);
    setActiveFilter('Original');
    setIsCropping(false);
    setFrame({ type: 'none', width: 20 });
    setImageSrc(origSrc);
    if (origSrc) {
      const img = new Image();
      img.onload = () => {
        setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setExportWidth(img.naturalWidth);
        setExportHeight(img.naturalHeight);
      };
      img.src = origSrc;
    }
    hist.clear(makeSnap(freshAdj, freshTx));
    toast('Reset to original ✓');
  }, [origSrc, hist, toast]);

  const resetAdj = useCallback(() => {
    const freshAdj = { ...DEFAULT_ADJ };
    setAdj(freshAdj);
    setActiveFilter('Original');
    pushHistory(freshAdj, tx);
    toast('Adjustments reset ✓');
  }, [tx, pushHistory, toast]);

  // ── Straighten (fine rotation) ────────────────────────────
  const setStraighten = useCallback((deg) => {
    setTx(p => ({ ...p, straighten: deg }));
  }, []);

  const commitStraighten = useCallback((deg) => {
    setTx(p => {
      const next = { ...p, straighten: deg };
      pushHistory(adj, next);
      return next;
    });
  }, [adj, pushHistory]);

  // ── Layer helpers (used by panels + Canvas) ───────────────
  const updateText = useCallback((id, patch) => {
    setTexts(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  }, []);
  const updateSticker = useCallback((id, patch) => {
    setStickers(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }, []);
  const removeLayer = useCallback((type, id) => {
    if (type === 'text') setTexts(p => p.filter(t => t.id !== id));
    else setStickers(p => p.filter(s => s.id !== id));
    setActiveLayer(cur => (cur?.type === type && cur?.id === id ? null : cur));
  }, []);
  const duplicateLayer = useCallback((type, id) => {
    if (type === 'text') {
      setTexts(p => {
        const src = p.find(t => t.id === id);
        if (!src) return p;
        const copy = { ...src, id: nextId('txt'), x: Math.min(95, src.x + 4), y: Math.min(95, src.y + 4) };
        setActiveLayer({ type: 'text', id: copy.id });
        return [...p, copy];
      });
    } else {
      setStickers(p => {
        const src = p.find(s => s.id === id);
        if (!src) return p;
        const copy = { ...src, id: nextId('stk'), x: Math.min(95, src.x + 4), y: Math.min(95, src.y + 4) };
        setActiveLayer({ type: 'sticker', id: copy.id });
        return [...p, copy];
      });
    }
  }, []);

  // ── Eyedropper ────────────────────────────────────────────
  const pickColorAt = useCallback((xPct, yPct) => {
    const c = samplePixel(imgRef.current, xPct, yPct);
    if (!c) { toast('Cannot sample (CORS) ✗'); return null; }
    setEyedropper({ color: c, x: xPct, y: yPct });
    return c;
  }, [toast]);

  // ── Export / Save ─────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!imgRef.current || !imageSrc || isSaving) return;
    setIsSaving(true);
    try {
      const imgEl = imgRef.current;

      // Resolve target dimensions
      let w, h;
      if (resizeMode === 'pixels' && exportWidth > 0 && exportHeight > 0) {
        w = Math.max(1, Math.round(exportWidth));
        h = Math.max(1, Math.round(exportHeight));
      } else {
        const scaleF = exportScale / 100;
        w = Math.max(1, Math.round(imgNatural.w * scaleF));
        h = Math.max(1, Math.round(imgNatural.h * scaleF));
      }

      const cv = document.createElement('canvas');
      const ctx = cv.getContext('2d');
      cv.width = w; cv.height = h;

      // Apply CSS-style colour adjustments via canvas filter
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = buildFilter(adj);
      ctx.drawImage(imgEl, 0, 0, w, h);
      ctx.filter = 'none';

      // Real unsharp mask
      if (adj.sharpen > 0) {
        const amount = (adj.sharpen / 100) * 1.6;
        applyUnsharpMask(ctx, w, h, { radius: 1, amount, threshold: 3 });
      }

      // Vignette
      if (adj.vignette > 0) {
        const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, (adj.vignette / 100) * 0.9)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Grain (canvas-based)
      if (adj.grain > 0) {
        applyGrain(ctx, w, h, adj.grain / 100);
      }

      // Frame border (white/black/film)
      if (frame.type !== 'none' && frame.type !== 'shadow' && frame.type !== 'polaroid') {
        const fw = (frame.width || 20);
        ctx.strokeStyle = frame.type === 'white' ? '#fff' : (frame.type === 'film' ? '#111' : '#000');
        ctx.lineWidth = fw * 2; // outline-style: stroke is centered, so 2x to keep inside
        ctx.strokeRect(0, 0, w, h);
      }

      // ── Overlay sizing ──
      // Text/sticker `size` is stored in CSS pixels relative to the *displayed*
      // image (the screen-fit <img>). The export canvas is at the *natural* (or
      // user-chosen) resolution, which is usually many times larger. We scale by
      // exportWidth / displayedWidth so a 32 px label on screen stays the same
      // *visual fraction* of the exported image.
      //
      // clientWidth is the unscaled layout box (ignores CSS `transform: scale`
      // used for the zoom slider), which is exactly what the % positions are
      // anchored to. If the image hasn't rendered yet, fall back to natural
      // size so we at least produce a sensibly-sized label.
      const displayedW = imgEl.clientWidth || imgEl.naturalWidth || imgNatural.w || 1;
      const overlayScale = w / displayedW;

      // Each layer is rendered inside its own transform stack so rotation +
      // opacity don't leak between layers (and a stray `globalAlpha` from one
      // sticker can't dim the next one).
      texts.forEach(t => {
        const px = Math.max(1, Math.round(t.size * overlayScale));
        const align = t.align || 'center';
        const lines = String(t.text ?? '').split('\n');
        const lineGap = px * 0.25;
        const rotation = (t.rotation || 0) * Math.PI / 180;

        ctx.save();
        ctx.translate(w * t.x / 100, h * t.y / 100);
        if (rotation !== 0) ctx.rotate(rotation);
        ctx.globalAlpha = (t.opacity ?? 100) / 100;

        // letterSpacing is a relatively new canvas API. Set it conditionally
        // so older browsers still render text (just without spacing).
        if ('letterSpacing' in ctx) {
          ctx.letterSpacing = `${(t.letterSpacing || 0) * overlayScale}px`;
        }

        ctx.font = `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${px}px ${t.font || 'DM Sans, sans-serif'}`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';

        if (t.shadow) {
          ctx.shadowColor = 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = 10 * overlayScale;
          ctx.shadowOffsetY = 2 * overlayScale;
        }

        // Outline (stroke under fill — paint-order isn't a canvas concept,
        // so we draw the stroke first to keep the fill on top.)
        const strokeWidth = (t.strokeWidth || 0) * overlayScale;
        const totalHeight = lines.length * px + (lines.length - 1) * lineGap;
        const startY = -totalHeight / 2 + px / 2;

        lines.forEach((line, i) => {
          const y = startY + i * (px + lineGap);
          if (strokeWidth > 0) {
            ctx.strokeStyle = t.strokeColor || '#000000';
            ctx.lineWidth = strokeWidth;
            ctx.lineJoin = 'round';
            ctx.strokeText(line, 0, y);
          }
          ctx.fillStyle = t.color;
          ctx.fillText(line, 0, y);
        });

        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      });

      stickers.forEach(st => {
        const px = Math.max(1, Math.round(st.size * overlayScale));
        const rotation = (st.rotation || 0) * Math.PI / 180;
        ctx.save();
        ctx.translate(w * st.x / 100, h * st.y / 100);
        if (rotation !== 0) ctx.rotate(rotation);
        ctx.globalAlpha = (st.opacity ?? 100) / 100;
        ctx.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.emoji, 0, 0);
        ctx.restore();
      });

      // Reset alignment so it doesn't leak into future draws
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;

      const fmtCfg = EXPORT_FORMATS.find(f => f.value === exportFmt);
      const quality = fmtCfg?.quality ? exportQuality / 100 : undefined;
      const dataUrl = cv.toDataURL(fmtCfg?.mime || 'image/png', quality);
      const link = document.createElement('a');
      const base = fileName ? fileName.replace(/\.[^.]+$/, '') : 'image';
      link.href = dataUrl;
      link.download = `${base}_edited.${exportFmt}`;
      link.click();
      toast(`Saved as ${exportFmt.toUpperCase()} ✓`);
    } catch (err) {
      console.error(err);
      toast('Export failed ✗');
    } finally {
      setIsSaving(false);
    }
  }, [
    imageSrc, adj, texts, stickers, exportFmt, exportQuality,
    exportScale, exportWidth, exportHeight, resizeMode,
    imgNatural, fileName, isSaving, frame, toast,
  ]);

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      // Ignore when typing in inputs / contenteditable
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault(); hist.undo(); return;
      }
      if ((ctrl && e.key.toLowerCase() === 'y') ||
          (ctrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault(); hist.redo(); return;
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault(); handleSave(); return;
      }
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault(); fileRef.current?.click(); return;
      }
      if (!ctrl) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setZoom(z => +(Math.min(4, z + 0.15)).toFixed(2));
          return;
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoom(z => +(Math.max(0.2, z - 0.15)).toFixed(2));
          return;
        }
        if (e.key === '0') {
          e.preventDefault(); setZoom(1); return;
        }
        if (e.key.toLowerCase() === 'g') {
          e.preventDefault(); setShowGrid(g => !g); return;
        }
        if (e.key.toLowerCase() === 'b') {
          e.preventDefault(); setShowBefore(s => !s); return;
        }
        if (e.key === 'Escape' && isCropping) {
          e.preventDefault(); cancelCrop(); return;
        }
        // Escape — clear text/sticker selection
        if (e.key === 'Escape' && activeLayer) {
          e.preventDefault(); setActiveLayer(null); return;
        }
        // Delete / Backspace — remove the active text or sticker layer.
        // The early-return guard at the top of this handler already skips
        // any key event whose target is an input/textarea, so typing
        // Backspace into the textarea won't accidentally delete the layer.
        if ((e.key === 'Delete' || e.key === 'Backspace') && activeLayer) {
          e.preventDefault();
          removeLayer(activeLayer.type, activeLayer.id);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hist, handleSave, setZoom, isCropping, cancelCrop, activeLayer, removeLayer]);

  // ── Derived ───────────────────────────────────────────────
  const filterStr = useMemo(() => buildFilter(adj), [adj]);
  const vigGrad = useMemo(() => buildVignette(adj.vignette), [adj.vignette]);
  // translate must be FIRST in the list so it acts in screen-space
  // (parent coords). Subsequent scale/rotate happen in the element's local
  // space and don't multiply the pan distance — drag feels 1:1 with cursor.
  const transformStr = useMemo(
    () => `translate(${tx.panX || 0}px, ${tx.panY || 0}px) rotate(${tx.rotation + (tx.straighten || 0)}deg) scaleX(${tx.flipX}) scaleY(${tx.flipY}) scale(${tx.zoom})`,
    [tx.rotation, tx.straighten, tx.flipX, tx.flipY, tx.zoom, tx.panX, tx.panY]
  );
  const hasImage = !!imageSrc;
  const isModified = useMemo(() => (
    JSON.stringify(adj) !== DEFAULT_ADJ_STR
    || tx.rotation !== 0
    || tx.flipX !== 1
    || tx.flipY !== 1
    || (tx.straighten || 0) !== 0
    || texts.length > 0
    || stickers.length > 0
  ), [adj, tx.rotation, tx.flipX, tx.flipY, tx.straighten, texts, stickers]);

  // Use histCursorRef to silence unused-ref lint
  histCursorRef.current = hist.historyLength;

  return {
    // lifecycle
    loading,
    // image
    imageSrc, origSrc, fileName, fileSize, imgNatural,
    // adjustment
    adj, changeAdj, commitAdj, applyPreset, resetAdj, autoEnhance,
    enhancePhoto, cancelEnhance, isEnhancing, enhanceProgress,
    // transform
    tx, setZoom, rotate, flip, setStraighten, commitStraighten,
    panBy, zoomAt, resetView,
    // crop
    isCropping, cropW, setCropW, cropH, setCropH, activeRatio,
    startCrop, doneCrop, cancelCrop, setAspectRatio,
    // overlays
    texts, setTexts, stickers, setStickers, nextId,
    activeLayer, setActiveLayer,
    updateText, updateSticker, removeLayer, duplicateLayer,
    // frame
    frame, setFrame,
    // export
    exportFmt, setExportFmt, exportQuality, setExportQuality,
    exportScale, setExportScale,
    exportWidth, setExportWidth, exportHeight, setExportHeight,
    resizeMode, setResizeMode,
    // ui
    activeTab, setActiveTab, activeFilter, setActiveFilter,
    showBefore, setShowBefore, showGrid, setShowGrid,
    isSaving, toastMsg,
    // eyedropper
    eyedropper, setEyedropper, pickerActive, setPickerActive, pickColorAt,
    // analysis
    computeHistogram,
    // history
    undo: hist.undo, redo: hist.redo, resetAll,
    canUndo: hist.canUndo, canRedo: hist.canRedo,
    historyLength: hist.historyLength,
    // derived
    filterStr, vigGrad, transformStr, hasImage, isModified,
    // refs
    fileRef, imgRef,
    // helpers
    handleFile, handleDrop, handleSave, toast,
  };
}
