// src/components/panels/index.jsx
// All panel components: Light, Color, Detail, Effects, Filters, Crop, Transform, Text, Export

import { useEffect, useState } from 'react';
import {
  LIGHT_ADJUSTMENTS, COLOR_ADJUSTMENTS, DETAIL_ADJUSTMENTS, EFFECTS_ADJUSTMENTS,
  PRESET_FILTERS, ASPECT_RATIOS, EXPORT_FORMATS, FRAME_OPTIONS,
  ZOOM_ICON, STRAIGHTEN_ICON,
} from '../../constants';
import { LuLock, LuLockOpen } from 'react-icons/lu';
import { AdjSlider, FilterCard, Btn, Tag, SL, HDivider, RangeRow } from '../ui';
import Histogram from '../ui/Histogram';
import { IC } from '../../constants/icons';

// Re-export the standalone TextPanel so callers can keep importing it from
// `components/panels`. The implementation lives in its own file because it
// grew large enough to deserve a separate module (live editing + sticker library).
export { default as TextPanel } from './TextPanel';

// ═══════════════════════════════════════════════════════════
// LIGHT PANEL — adjustments + Quick / Enhance Photo
// ═══════════════════════════════════════════════════════════
const ENHANCE_STRENGTHS = [
  { id: 'low',    label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'high',   label: 'Strong' },
];

export function LightPanel({
  adj, onChange, onCommit, disabled, autoEnhance, hasImage,
  enhancePhoto, cancelEnhance, isEnhancing, enhanceProgress,
}) {
  const [strength, setStrength] = useState('medium');
  const [upscale, setUpscale] = useState(false);

  const handleEnhance = () => {
    if (!enhancePhoto || isEnhancing) return;
    enhancePhoto({ strength, upscale });
  };

  return (
    <div>
      <p className="pc-hint">Adjust exposure, contrast and tonal range</p>

      {hasImage && (
        <div className="pc-enhance-card">
          <div className="pc-enhance-card__head">
            <div>
              <div className="pc-enhance-card__title">{IC.Sparkle} Enhance Photo</div>
              <div className="pc-enhance-card__sub">
                Multi-pass tonal lift, local contrast, and detail sharpen.
              </div>
            </div>
          </div>

          {/* Strength chooser */}
          <div className="pc-enhance-row">
            <span className="pc-enhance-lbl">Strength</span>
            <div className="pc-enhance-tags">
              {ENHANCE_STRENGTHS.map(s => (
                <Tag
                  key={s.id}
                  label={s.label}
                  active={strength === s.id}
                  onClick={() => !isEnhancing && setStrength(s.id)}
                />
              ))}
            </div>
          </div>

          {/* Upscale toggle */}
          <div className="pc-enhance-row">
            <span className="pc-enhance-lbl">2× Upscale</span>
            <Tag
              label={upscale ? 'On' : 'Off'}
              active={upscale}
              onClick={() => !isEnhancing && setUpscale(p => !p)}
            />
          </div>

          {/* Action / progress */}
          {!isEnhancing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={handleEnhance} variant="primary" full size="sm" disabled={disabled}>
                {IC.Sparkle} Enhance
              </Btn>
              <Btn onClick={autoEnhance} variant="ghost" size="sm" disabled={disabled} title="Quick non-destructive suggestion (no pixel changes)">
                Quick
              </Btn>
            </div>
          ) : (
            <>
              <div className="pc-enhance-progress">
                <div
                  className="pc-enhance-progress__bar"
                  style={{ width: `${Math.round((enhanceProgress?.overall || 0) * 100)}%` }}
                />
              </div>
              <div className="pc-enhance-status">
                <span>{enhanceProgress?.label || 'Working…'}</span>
                <span>{Math.round((enhanceProgress?.overall || 0) * 100)}%</span>
              </div>
              <Btn onClick={cancelEnhance} variant="danger" full size="sm">{IC.Close} Cancel</Btn>
            </>
          )}

          <div className="pc-enhance-note">
            Algorithmic enhancement — not a face-restoration AI. Use Reset to revert.
          </div>
        </div>
      )}

      {LIGHT_ADJUSTMENTS.map(a => (
        <AdjSlider key={a.key} adj={a} value={adj[a.key]} onChange={v => onChange(a.key, v)} onCommit={onCommit} disabled={disabled || isEnhancing} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COLOR PANEL
// ═══════════════════════════════════════════════════════════
export function ColorPanel({ adj, onChange, onCommit, disabled, pickColorAt, eyedropper }) {
  const [pickX, setPickX] = useState(50);
  const [pickY, setPickY] = useState(50);

  return (
    <div>
      <p className="pc-hint">Control saturation, hue and colour temperature</p>
      {COLOR_ADJUSTMENTS.map(a => (
        <AdjSlider key={a.key} adj={a} value={adj[a.key]} onChange={v => onChange(a.key, v)} onCommit={onCommit} disabled={disabled} />
      ))}

      <HDivider />
      <SL>Eyedropper</SL>
      <p className="pc-hint">Sample a colour from the image — drag the X/Y sliders.</p>
      <RangeRow label="Sample X" value={pickX} onChange={(v) => { setPickX(v); pickColorAt?.(v, pickY); }} min={0} max={100} unit="%" />
      <RangeRow label="Sample Y" value={pickY} onChange={(v) => { setPickY(v); pickColorAt?.(pickX, v); }} min={0} max={100} unit="%" />
      {eyedropper?.color && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 9,
          background: 'var(--bg-overlay)', border: '1px solid var(--bd)',
          marginTop: 4,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: eyedropper.color, border: '1.5px solid var(--bd2)',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 600, fontFamily: 'monospace' }}>
            {eyedropper.color.toUpperCase()}
          </span>
          <button
            type="button"
            className="pc-tag"
            style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}
            onClick={() => navigator.clipboard?.writeText(eyedropper.color)}
            title="Copy hex"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DETAIL PANEL — now with histogram
// ═══════════════════════════════════════════════════════════
export function DetailPanel({ adj, onChange, onCommit, disabled, imgRef, imageSrc, filterStr, hasImage }) {
  return (
    <div>
      <p className="pc-hint">Sharpen details or smooth noise</p>

      {hasImage && (
        <>
          <SL>Histogram</SL>
          <Histogram imgRef={imgRef} imageSrc={imageSrc} filterStr={filterStr} />
        </>
      )}

      {DETAIL_ADJUSTMENTS.map(a => (
        <AdjSlider key={a.key} adj={a} value={adj[a.key]} onChange={v => onChange(a.key, v)} onCommit={onCommit} disabled={disabled} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EFFECTS PANEL
// ═══════════════════════════════════════════════════════════
export function EffectsPanel({ adj, onChange, onCommit, disabled }) {
  return (
    <div>
      <p className="pc-hint">Apply creative effects and artistic looks</p>
      {EFFECTS_ADJUSTMENTS.map(a => (
        <AdjSlider key={a.key} adj={a} value={adj[a.key]} onChange={v => onChange(a.key, v)} onCommit={onCommit} disabled={disabled} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FILTERS PANEL
// ═══════════════════════════════════════════════════════════
export function FiltersPanel({ activeFilter, applyPreset, imageSrc, hasImage, isMobile }) {
  return (
    <div>
      <p className="pc-hint">
        {hasImage ? 'Tap a preset to apply instantly' : 'Open an image to preview filters'}
      </p>
      {isMobile ? (
        <div className="pc-fr">
          {PRESET_FILTERS.map(p => (
            <FilterCard key={p.name} preset={p} active={activeFilter === p.name}
              imgSrc={hasImage ? imageSrc : null} onClick={() => hasImage && applyPreset(p)} size={62} />
          ))}
        </div>
      ) : (
        <div className="pc-fg">
          {PRESET_FILTERS.map(p => (
            <FilterCard key={p.name} preset={p} active={activeFilter === p.name}
              imgSrc={hasImage ? imageSrc : null} onClick={() => hasImage && applyPreset(p)} size={68} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CROP PANEL
// ═══════════════════════════════════════════════════════════
export function CropPanel({
  isCropping, hasImage,
  activeRatio, setAspectRatio,
  cropW, setCropW, cropH, setCropH,
  startCrop, doneCrop, cancelCrop,
}) {
  const [localRatio, setLocalRatio] = useState(activeRatio);

  const handleRatioClick = (ar) => {
    setLocalRatio(ar.label);
    if (isCropping) setAspectRatio(ar);
  };

  return (
    <div>
      {isCropping && (
        <div className="pc-crop-badge">
          <div className="b" /><span>Crop mode — drag to select area</span>
        </div>
      )}
      <SL>Aspect Ratio</SL>
      <div className="pc-ratio-row">
        {ASPECT_RATIOS.map(ar => (
          <Tag key={ar.label} label={ar.label} active={(isCropping ? activeRatio : localRatio) === ar.label} onClick={() => handleRatioClick(ar)} />
        ))}
      </div>
      {!isCropping && (
        <>
          <SL>Custom Size (px)</SL>
          <div className="pc-ci">
            <input type="number" placeholder="Width" value={cropW} onChange={e => setCropW(e.target.value)} />
            <input type="number" placeholder="Height" value={cropH} onChange={e => setCropH(e.target.value)} />
          </div>
          <Btn onClick={startCrop} disabled={!hasImage} variant="primary" full>{IC.Crop} Start Crop</Btn>
        </>
      )}
      {isCropping && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <Btn onClick={doneCrop}   variant="success" full size="sm">{IC.Check} Apply Crop</Btn>
          <Btn onClick={cancelCrop} variant="danger"  full size="sm">{IC.Close} Cancel</Btn>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TRANSFORM PANEL
// ═══════════════════════════════════════════════════════════
export function TransformPanel({ tx, setZoom, rotate, flip, hasImage, setStraighten, commitStraighten }) {
  const zoomAdj = { key: 'zoom', label: 'Zoom', icon: ZOOM_ICON, min: 0.2, max: 4, default: 1, unit: '×' };

  return (
    <div>
      <SL>Rotate</SL>
      <div className="pc-tf-row">
        <button className="pc-tf-btn" onClick={() => rotate(-1)} disabled={!hasImage}>
          {IC.RotL}<span>Left 90°</span>
        </button>
        <button className="pc-tf-btn" onClick={() => rotate(1)}  disabled={!hasImage}>
          {IC.RotR}<span>Right 90°</span>
        </button>
      </div>

      <SL>Flip</SL>
      <div className="pc-tf-row">
        <button className={`pc-tf-btn ${tx.flipX === -1 ? 'on' : ''}`} onClick={() => flip('x')} disabled={!hasImage}>
          {IC.FlipH}<span>Horizontal</span>
        </button>
        <button className={`pc-tf-btn ${tx.flipY === -1 ? 'on' : ''}`} onClick={() => flip('y')} disabled={!hasImage}>
          {IC.FlipV}<span>Vertical</span>
        </button>
      </div>

      <SL>Zoom</SL>
      <AdjSlider adj={zoomAdj} value={tx.zoom} onChange={v => setZoom(v)} disabled={!hasImage} />

      <SL>Fine Rotation</SL>
      <AdjSlider
        adj={{ key: 'straighten', label: 'Straighten', icon: STRAIGHTEN_ICON, min: -45, max: 45, default: 0, unit: '°' }}
        value={tx.straighten || 0}
        onChange={setStraighten}
        onCommit={(_, v) => commitStraighten?.(v)}
        disabled={!hasImage}
      />

      <HDivider />
      <SL>Current State</SL>
      {[
        ['Rotation',  `${tx.rotation}°`],
        ['Straighten',`${tx.straighten || 0}°`],
        ['Flip H',    tx.flipX === -1 ? 'On' : 'Off'],
        ['Flip V',    tx.flipY === -1 ? 'On' : 'Off'],
        ['Zoom',      `${Math.round(tx.zoom * 100)}%`],
      ].map(([k, v]) => (
        <div className="pc-info-row" key={k}>
          <span className="pc-info-row__k">{k}</span>
          <span className={`pc-info-row__v ${v !== 'Off' && v !== '0°' && v !== '100%' ? 'hi' : ''}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// TextPanel + StickerPanel live in their own files now; see the re-export at
// the top of this module. Keeping the boundary explicit so future panel work
// (e.g. brush tool) has a clear place to land.

// ═══════════════════════════════════════════════════════════
// EXPORT PANEL — with resize-to-dimensions
// ═══════════════════════════════════════════════════════════
export function ExportPanel({
  exportFmt, setExportFmt,
  exportQuality, setExportQuality,
  exportScale, setExportScale,
  exportWidth, setExportWidth, exportHeight, setExportHeight,
  resizeMode, setResizeMode,
  imgNatural, fileName, hasImage, isSaving, handleSave,
  frame, setFrame,
}) {
  const fmtCfg   = EXPORT_FORMATS.find(f => f.value === exportFmt);

  // keep aspect ratio when one dimension changes
  const [lockAspect, setLockAspect] = useState(true);
  const aspect = imgNatural.w / Math.max(1, imgNatural.h);

  // Reset pixel inputs when image changes
  useEffect(() => {
    if (imgNatural.w && !exportWidth)  setExportWidth(imgNatural.w);
    if (imgNatural.h && !exportHeight) setExportHeight(imgNatural.h);
  }, [imgNatural.w, imgNatural.h, exportWidth, exportHeight, setExportWidth, setExportHeight]);

  const onWidthChange = (val) => {
    const v = Math.max(1, Math.min(20000, Math.round(val) || 0));
    setExportWidth(v);
    if (lockAspect && aspect > 0) setExportHeight(Math.max(1, Math.round(v / aspect)));
  };
  const onHeightChange = (val) => {
    const v = Math.max(1, Math.min(20000, Math.round(val) || 0));
    setExportHeight(v);
    if (lockAspect && aspect > 0) setExportWidth(Math.max(1, Math.round(v * aspect)));
  };

  const outW = resizeMode === 'pixels'
    ? exportWidth
    : Math.round((imgNatural.w || 0) * exportScale / 100);
  const outH = resizeMode === 'pixels'
    ? exportHeight
    : Math.round((imgNatural.h || 0) * exportScale / 100);

  return (
    <div>
      {/* Frame */}
      <SL>Border / Frame</SL>
      <div className="pc-frame-row">
        {FRAME_OPTIONS.map(f => (
          <Tag key={f.id} label={f.label} active={frame.type === f.id} onClick={() => setFrame(p => ({ ...p, type: f.id }))} />
        ))}
      </div>
      {frame.type !== 'none' && (
        <RangeRow label="Frame Width" value={frame.width || 20} onChange={v => setFrame(p => ({ ...p, width: v }))} min={4} max={80} unit="px" />
      )}

      <HDivider />

      {/* Format */}
      <SL>Output Format</SL>
      <div className="pc-exp-fmt-row">
        {EXPORT_FORMATS.map(f => (
          <Tag key={f.value} label={f.label} active={exportFmt === f.value} onClick={() => setExportFmt(f.value)} />
        ))}
      </div>

      {/* Quality (JPEG/WebP only) */}
      {fmtCfg?.quality && (
        <RangeRow label="Quality" value={exportQuality} onChange={setExportQuality} min={20} max={100} unit="%" />
      )}

      {/* Resize mode toggle */}
      <SL>Resize</SL>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <Tag label="By Scale"  active={resizeMode === 'scale'}  onClick={() => setResizeMode('scale')} />
        <Tag label="By Pixels" active={resizeMode === 'pixels'} onClick={() => setResizeMode('pixels')} />
      </div>

      {resizeMode === 'scale' ? (
        <RangeRow label="Export Scale" value={exportScale} onChange={setExportScale} min={10} max={200} unit="%" />
      ) : (
        <>
          <div className="pc-ci">
            <input
              type="number"
              placeholder="Width"
              value={exportWidth || ''}
              onChange={(e) => onWidthChange(Number(e.target.value))}
            />
            <input
              type="number"
              placeholder="Height"
              value={exportHeight || ''}
              onChange={(e) => onHeightChange(Number(e.target.value))}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Tag
              label={lockAspect
                ? <><LuLock size={12} /> Aspect locked</>
                : <><LuLockOpen size={12} /> Aspect free</>}
              active={lockAspect}
              onClick={() => setLockAspect(p => !p)}
            />
          </div>
        </>
      )}

      {/* Output info */}
      {hasImage && (
        <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '9px', marginBottom: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="pc-info-row" style={{ borderBottom: 'none', padding: '3px 0' }}>
            <span className="pc-info-row__k">Output size</span>
            <span className="pc-info-row__v hi">{outW} × {outH} px</span>
          </div>
          <div className="pc-info-row" style={{ borderBottom: 'none', padding: '3px 0' }}>
            <span className="pc-info-row__k">Format</span>
            <span className="pc-info-row__v">{exportFmt.toUpperCase()}{fmtCfg?.quality ? ` @ ${exportQuality}%` : ''}</span>
          </div>
          <div className="pc-info-row" style={{ borderBottom: 'none', padding: '3px 0' }}>
            <span className="pc-info-row__k">File name</span>
            <span className="pc-info-row__v">{fileName ? fileName.replace(/\.[^.]+$/, '') + `_edited.${exportFmt}` : `image_edited.${exportFmt}`}</span>
          </div>
        </div>
      )}

      <Btn onClick={handleSave} variant="primary" full disabled={!hasImage || isSaving} size="md">
        {isSaving
          ? <>{IC.Spinner} Exporting...</>
          : <>{IC.Download} Export & Download</>
        }
      </Btn>

      <HDivider />

      {/* Image info */}
      <SL>Source Image</SL>
      {[
        ['File',       fileName || '—'],
        ['Dimensions', hasImage ? `${imgNatural.w} × ${imgNatural.h} px` : '—'],
      ].map(([k, v]) => (
        <div className="pc-info-row" key={k}>
          <span className="pc-info-row__k">{k}</span>
          <span className="pc-info-row__v">{v}</span>
        </div>
      ))}
    </div>
  );
}
