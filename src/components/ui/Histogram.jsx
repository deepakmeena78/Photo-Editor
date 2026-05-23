// src/components/ui/Histogram.jsx
// Renders an RGB+luminance histogram from a source <img>.
// Cheap enough to recompute on demand (samples to 256px max).
import { useEffect, useRef } from 'react';
import { computeHistogram } from '../../utils/imageAnalysis';

const W = 240;
const H = 64;

export default function Histogram({ imgRef, imageSrc, filterStr }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const drawMessage = (text) => {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '11px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, H / 2);
    };

    const imgEl = imgRef?.current;
    if (!imgEl || !imageSrc) {
      drawMessage('Load an image to see histogram');
      return;
    }

    const sw = imgEl.naturalWidth, sh = imgEl.naturalHeight;
    if (!sw || !sh) {
      drawMessage('Loading…');
      return;
    }
    const targetW = Math.min(256, sw);
    const targetH = Math.max(1, Math.round(sh * (targetW / sw)));

    const off = document.createElement('canvas');
    off.width = targetW; off.height = targetH;
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    offCtx.filter = filterStr || 'none';
    try {
      offCtx.drawImage(imgEl, 0, 0, targetW, targetH);
    } catch {
      drawMessage('Histogram unavailable (CORS)');
      return;
    }

    const h = computeHistogram(off, 256);
    if (!h) { drawMessage('Histogram unavailable'); return; }

    // Find peak (excluding extreme spikes at 0/255 for nicer scaling)
    let peak = 1;
    for (let i = 1; i < 255; i++) {
      if (h.r[i] > peak) peak = h.r[i];
      if (h.g[i] > peak) peak = h.g[i];
      if (h.b[i] > peak) peak = h.b[i];
      if (h.lum[i] > peak) peak = h.lum[i];
    }

    ctx.globalCompositeOperation = 'lighter';
    const drawSeries = (arr, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * W;
        const y = H - Math.min(H, (arr[i] / peak) * H);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    };

    drawSeries(h.r, 'rgba(239, 68, 68, 0.55)');
    drawSeries(h.g, 'rgba(34, 197, 94, 0.55)');
    drawSeries(h.b, 'rgba(59, 130, 246, 0.55)');

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * W;
      const y = H - Math.min(H, (h.lum[i] / peak) * H);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [imgRef, imageSrc, filterStr]);

  return (
    <div className="pc-hist">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: 6 }}
      />
    </div>
  );
}
