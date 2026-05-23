// src/components/editor/Canvas.jsx
import { buildGrainStyle } from '../../constants';
import { IC } from '../../constants/icons';
import { LuLoaderCircle, LuImage } from 'react-icons/lu';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';

export default function Canvas({
  imageSrc, origSrc, imgRef,
  filterStr, vigGrad, transformStr,
  isCropping, showBefore, showGrid,
  hasImage, adj,
  texts, setTexts, stickers, setStickers,
  zoom, imgNatural, isModified,
  handleDrop, openFile,
  isSaving,
  // pan / zoom callbacks from the hook
  panBy, zoomAt,
  // selection lifted to the hook so panels can read/edit the active layer
  activeLayer, setActiveLayer,
}) {
  const grainStyle = useMemo(() => buildGrainStyle(adj.grain), [adj.grain]);
  // Mirrored in state so render can react (cursor changes grab→grabbing).
  const [isPanning, setIsPanning] = useState(false);

  // Pointer-op state. Single-flight: only one drag/pinch operation at a time.
  const dragRef = useRef(null);
  const latestPointerRef = useRef(null);
  const rafRef = useRef(null);
  const pointersRef = useRef(new Map());     // active pointer positions for pinch
  const pinchRef = useRef(null);              // { startDist, startZoom, anchor }

  const clampPct = (v) => Math.max(0, Math.min(100, v));

  /**
   * Bounds for pan: at zoom Z the image is Z× wider than its layout box;
   * the excess on each side is (Z-1) * displayedWidth / 2. We allow pan
   * up to that, so the image edge can be dragged to the screen edge but
   * never past it.
   */
  const computePanBounds = useCallback(() => {
    const el = imgRef.current;
    if (!el) return { maxX: 0, maxY: 0 };
    const w = el.clientWidth, h = el.clientHeight;
    const excessX = Math.max(0, (zoom - 1) * w / 2);
    const excessY = Math.max(0, (zoom - 1) * h / 2);
    return { maxX: excessX, maxY: excessY };
  }, [imgRef, zoom]);

  /** Convert a screen point to an anchor offset relative to the image centre. */
  const anchorFromEvent = useCallback((clientX, clientY) => {
    const el = imgRef.current;
    if (!el) return { ax: 0, ay: 0 };
    const r = el.getBoundingClientRect();
    return {
      ax: clientX - (r.left + r.width / 2),
      ay: clientY - (r.top + r.height / 2),
    };
  }, [imgRef]);

  const updateLayer = useCallback((type, id, updater) => {
    if (type === 'text') {
      setTexts(prev => prev.map(t => (t.id === id ? { ...t, ...updater(t) } : t)));
      return;
    }
    setStickers(prev => prev.map(s => (s.id === id ? { ...s, ...updater(s) } : s)));
  }, [setTexts, setStickers]);

  const deleteLayer = useCallback((type, id) => {
    if (type === 'text') {
      setTexts(prev => prev.filter(t => t.id !== id));
    } else {
      setStickers(prev => prev.filter(s => s.id !== id));
    }
    setActiveLayer(cur => (cur?.type === type && cur?.id === id) ? null : cur);
  }, [setTexts, setStickers, setActiveLayer]);

  // Delete the active layer via Delete / Backspace, unless the user is typing.
  useEffect(() => {
    if (!activeLayer) return;
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      e.preventDefault();
      deleteLayer(activeLayer.type, activeLayer.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeLayer, deleteLayer]);

  // ── Overlay (text/sticker) drag ──
  const handleLayerPointerDown = useCallback((e, type, item) => {
    if (e.target.closest('.pc-canvas__resize')) return;
    if (e.target.closest('.pc-canvas__delete')) return;
    e.stopPropagation();
    setActiveLayer({ type, id: item.id });
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      mode: 'move',
      type,
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      startItemX: item.x,
      startItemY: item.y,
      width: rect.width || 1,
      height: rect.height || 1,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [imgRef, setActiveLayer]);

  const handleResizePointerDown = useCallback((e, type, item) => {
    e.stopPropagation();
    setActiveLayer({ type, id: item.id });
    dragRef.current = {
      mode: 'resize',
      type,
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      startSize: item.size || 32,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [setActiveLayer]);

  // ── Canvas-level pan ──
  const handleCanvasPointerDown = useCallback((e) => {
    // Track every pointer for pinch detection (touch + pen).
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two-finger pinch start
    if (pointersRef.current.size === 2 && hasImage && !isCropping) {
      const pts = [...pointersRef.current.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const { ax, ay } = anchorFromEvent(midX, midY);
      pinchRef.current = { startDist: dist, startZoom: zoom, anchor: { ax, ay } };
      // cancel any in-progress single-finger drag
      dragRef.current = null;
      return;
    }

    // Ignore if the press landed on an overlay/control — those have their own handlers.
    if (e.target.closest('.pc-canvas__overlay') || e.target.closest('.pc-drop') ||
        e.target.closest('button') || e.target.closest('input') ||
        e.target.closest('.pc-status')) {
      return;
    }
    if (!hasImage || isCropping || zoom <= 1.001) return;

    // Try to capture on the canvas main element. Some browsers reject
    // capture if the element isn't a positioned ancestor, so wrap in try.
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }

    dragRef.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    setIsPanning(true);
  }, [hasImage, isCropping, zoom, anchorFromEvent]);

  const commitDragFrame = useCallback(() => {
    rafRef.current = null;
    const op = dragRef.current;
    const p = latestPointerRef.current;
    if (!op || !p) return;

    // Pinch (two pointers) takes precedence over pan
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const factor = dist / pinchRef.current.startDist;
      const target = Math.max(0.2, Math.min(4, pinchRef.current.startZoom * factor));
      // zoomAt with a factor *relative to current* zoom
      const rel = target / zoom;
      if (Math.abs(rel - 1) > 1e-3) {
        zoomAt?.(pinchRef.current.anchor.ax, pinchRef.current.anchor.ay, rel, computePanBounds());
      }
      return;
    }

    if (op.mode === 'move') {
      const dxPct = ((p.clientX - op.startX) / op.width) * 100;
      const dyPct = ((p.clientY - op.startY) / op.height) * 100;
      updateLayer(op.type, op.id, () => ({
        x: clampPct(op.startItemX + dxPct),
        y: clampPct(op.startItemY + dyPct),
      }));
      return;
    }

    if (op.mode === 'pan') {
      const dx = p.clientX - op.lastX;
      const dy = p.clientY - op.lastY;
      op.lastX = p.clientX;
      op.lastY = p.clientY;
      panBy?.(dx, dy, computePanBounds());
      return;
    }

    // Resize: use dominant axis for predictable feel.
    if (op.mode === 'resize') {
      const dX = p.clientX - op.startX;
      const dY = p.clientY - op.startY;
      const dominant = Math.abs(dX) > Math.abs(dY) ? dX : dY;
      const sensitivity = 0.45;
      const minSize = op.type === 'text' ? 10 : 14;
      const maxSize = 360;
      const nextSize = op.startSize + dominant * sensitivity;
      updateLayer(op.type, op.id, () => ({
        size: Math.max(minSize, Math.min(maxSize, nextSize)),
      }));
    }
  }, [updateLayer, panBy, zoomAt, zoom, computePanBounds]);

  const handlePointerMove = useCallback((e) => {
    // keep pointer map fresh (needed for pinch midpoint)
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const op = dragRef.current;
    const pinching = pinchRef.current && pointersRef.current.size >= 2;
    if (!op && !pinching) return;
    latestPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(commitDragFrame);
  }, [commitDragFrame]);

  const handlePointerUp = useCallback((e) => {
    if (e?.pointerId != null) pointersRef.current.delete(e.pointerId);
    // Exit pinch when fewer than 2 fingers remain
    if (pointersRef.current.size < 2) pinchRef.current = null;
    // Only clear the drag op when no fingers remain (so pinch→pan handoff works)
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
      latestPointerRef.current = null;
      setIsPanning(false);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Wheel zoom (anchored at cursor) ──
  useEffect(() => {
    const el = imgRef.current?.parentElement?.parentElement; // .pc-canvas main
    // Find the main canvas via class to be safe
    const canvasEl = document.querySelector('.pc-canvas');
    const target = canvasEl || el;
    if (!target) return;

    const onWheel = (e) => {
      if (!hasImage || isCropping) return;
      // Only act on intentional wheel/pinch-trackpad gestures inside the canvas.
      if (!target.contains(e.target)) return;
      e.preventDefault();
      const { ax, ay } = anchorFromEvent(e.clientX, e.clientY);
      // deltaY < 0 = scroll up = zoom in
      // step magnitude scales with delta so trackpad pinch feels responsive
      const step = Math.min(0.25, Math.abs(e.deltaY) * 0.0018);
      const factor = e.deltaY < 0 ? (1 + step) : (1 / (1 + step));
      zoomAt?.(ax, ay, factor, computePanBounds());
    };
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => target.removeEventListener('wheel', onWheel);
  }, [hasImage, isCropping, anchorFromEvent, zoomAt, computePanBounds, imgRef]);

  // ── Double-click / double-tap to toggle 1× ↔ 2× ──
  const handleDoubleClick = useCallback((e) => {
    if (!hasImage || isCropping) return;
    if (e.target.closest('.pc-canvas__overlay')) return;
    const { ax, ay } = anchorFromEvent(e.clientX, e.clientY);
    if (zoom > 1.001) {
      zoomAt?.(0, 0, 1 / zoom, computePanBounds()); // back to fit
    } else {
      zoomAt?.(ax, ay, 2, computePanBounds());
    }
  }, [hasImage, isCropping, anchorFromEvent, zoom, zoomAt, computePanBounds]);

  // Cursor reflects what a click+drag would do.
  const canvasCursor = isCropping
    ? 'default'
    : hasImage && zoom > 1.001
      ? (isPanning ? 'grabbing' : 'grab')
      : 'default';

  return (
    <main
      className={`pc-canvas ${showGrid ? 'has-grid' : ''}`}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => {
        // Deselect ONLY when the click landed on the canvas backdrop — not
        // on a text/sticker overlay (whose pointer handler already selected
        // itself) or its resize handle. pointer events and click events are
        // separate, so `stopPropagation` on the overlay's pointerdown does
        // not stop the subsequent click from bubbling here. Without this
        // guard, every tap-to-select on a layer would be immediately
        // undone by this handler firing 1ms later.
        if (e.target.closest('.pc-canvas__overlay')) return;
        if (e.target.closest('button, input')) return;
        setActiveLayer?.(null);
      }}
      style={{ cursor: canvasCursor }}
    >
      {/* ── Badges ── */}
      {showBefore && hasImage && (
        <div className="pc-canvas__badge pc-canvas__badge--before">BEFORE</div>
      )}
      {isCropping && (
        <div className="pc-canvas__badge pc-canvas__badge--crop">
          <span className="blink" />
          Crop Mode — use panel to confirm
        </div>
      )}

      {/* ── Drop Zone ── */}
      {!hasImage ? (
        <div className="pc-drop" onClick={openFile}>
          <div className="pc-drop__icon">
            <LuImage size={34} color="#d97706" strokeWidth={1.5} />
          </div>
          <div>
            <p className="pc-drop__title">Drop your image here</p>
            <p className="pc-drop__sub">or click to browse files</p>
            <p className="pc-drop__fmt">PNG · JPG · WEBP · GIF · BMP</p>
          </div>
          <div className="pc-drop__cta">{IC.Upload} Choose File</div>
        </div>
      ) : (
        /* ── Image ── */
        <div className="pc-canvas__img-wrap">
          <img
            ref={imgRef}
            src={showBefore ? origSrc : imageSrc}
            alt="editing"
            className="pc-canvas__img"
            draggable={false}
            style={{
              filter:    showBefore ? 'none' : filterStr,
              transform: isCropping  ? 'none' : transformStr,
            }}
          />

          {/* Vignette overlay */}
          {(adj.vignette > 0) && !isCropping && !showBefore && (
            <div className="pc-canvas__vignette" style={{ background: vigGrad }} />
          )}

          {/* Grain overlay (visual preview) */}
          {(adj.grain > 0) && !isCropping && !showBefore && (
            <div style={grainStyle} />
          )}

          {/* Text overlays */}
          {texts.map(t => {
            const strokeWidth = t.strokeWidth || 0;
            const rotation = t.rotation || 0;
            const align = t.align || 'center';
            // Align-aware horizontal anchor so the editor preview matches what
            // the export canvas does with `ctx.textAlign`:
            //   • center → translate(-50%) — text centered on anchor
            //   • left   → translate(  0%) — text *starts* at anchor
            //   • right  → translate(-100%) — text *ends* at anchor
            // Without this, left/right-aligned text appeared centered in the
            // editor but the export shifted it by half the text width,
            // pushing long lines off the right (or left) edge of the canvas.
            const xOffset = align === 'left'  ? '0%'
                          : align === 'right' ? '-100%'
                          : '-50%';
            const transform = `translate(${xOffset}, -50%) rotate(${rotation}deg)`;
            const isActive = activeLayer?.type === 'text' && activeLayer?.id === t.id;
            return (
              <div
                key={t.id}
                className={`pc-canvas__overlay ${isActive ? 'is-active' : ''}`}
                style={{
                  left:          `${t.x}%`,
                  top:           `${t.y}%`,
                  transform,
                  color:          t.color,
                  fontSize:      `${t.size}px`,
                  fontFamily:     t.font || 'DM Sans, sans-serif',
                  fontWeight:     t.bold ? '700' : '400',
                  fontStyle:      t.italic ? 'italic' : 'normal',
                  textShadow:     t.shadow ? '0 2px 10px rgba(0,0,0,0.9)' : 'none',
                  letterSpacing: `${t.letterSpacing || 0}px`,
                  opacity:       (t.opacity ?? 100) / 100,
                  textAlign:      t.align || 'center',
                  whiteSpace:     'pre-wrap',     // honour line breaks the user types
                  maxWidth:       '92%',          // wrap long lines inside the image
                  zIndex:         isActive ? 30 : 5, // selected overlay floats above others
                  WebkitTextStroke: strokeWidth > 0
                    ? `${strokeWidth}px ${t.strokeColor || '#000'}`
                    : '0',
                  paintOrder:     'stroke fill', // stroke under fill — cleaner look
                }}
                onPointerDown={(e) => handleLayerPointerDown(e, 'text', t)}
              >
                {t.text || ' '}
                {isActive && (
                  <button
                    type="button"
                    className="pc-canvas__delete"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); deleteLayer('text', t.id); }}
                    aria-label="Delete text"
                    title="Delete (Del)"
                  >{IC.Close}</button>
                )}
                <button
                  className="pc-canvas__resize"
                  onPointerDown={(e) => handleResizePointerDown(e, 'text', t)}
                  aria-label="Resize text"
                />
              </div>
            );
          })}

          {/* Sticker overlays */}
          {stickers.map(s => {
            const rotation = s.rotation || 0;
            const transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
            const isActive = activeLayer?.type === 'sticker' && activeLayer?.id === s.id;
            return (
              <div
                key={s.id}
                className={`pc-canvas__overlay ${isActive ? 'is-active' : ''}`}
                style={{
                  left:     `${s.x}%`,
                  top:      `${s.y}%`,
                  transform,
                  fontSize: `${s.size}px`,
                  opacity:  (s.opacity ?? 100) / 100,
                  lineHeight: 1,
                  zIndex:   isActive ? 30 : 5,
                }}
                onPointerDown={(e) => handleLayerPointerDown(e, 'sticker', s)}
              >
                {s.emoji}
                {isActive && (
                  <button
                    type="button"
                    className="pc-canvas__delete"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); deleteLayer('sticker', s.id); }}
                    aria-label="Delete sticker"
                    title="Delete (Del)"
                  >{IC.Close}</button>
                )}
                <button
                  className="pc-canvas__resize"
                  onPointerDown={(e) => handleResizePointerDown(e, 'sticker', s)}
                  aria-label="Resize sticker"
                />
              </div>
            );
          })}

          {/* Saving overlay */}
          {isSaving && (
            <div className="pc-saving-overlay">
              <LuLoaderCircle size={28} strokeWidth={2.25} className="pc-spin" />
            </div>
          )}
        </div>
      )}

      {/* ── Status bar ── */}
      {hasImage && (
        <div className="pc-status">
          <span className="pc-status__t">{Math.round(zoom * 100)}%</span>
          <div className="pc-vdivider" style={{ margin: '0 2px' }} />
          <span className="pc-status__t">{imgNatural.w} × {imgNatural.h}</span>
          {isModified && (
            <>
              <div className="pc-vdivider" style={{ margin: '0 2px' }} />
              <div className="pc-status__dot" />
              <span className="pc-status__edited">Edited</span>
            </>
          )}
        </div>
      )}
    </main>
  );
}
