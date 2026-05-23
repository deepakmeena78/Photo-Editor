// src/components/panels/TextPanel.jsx
// Two modes: Text editing and Sticker library.
// In Text mode, if a text layer is selected on the canvas, the form *edits
// that layer live* (font / bold / italic / shadow / color / size / outline
// / opacity / rotation / letter-spacing). Otherwise the form composes a new
// layer. Sticker mode uses the searchable categorized library.

import { useState } from 'react';
import { Btn, Tag, SL, HDivider, RangeRow } from '../ui';
import { IC } from '../../constants/icons';
import { nextId } from '../../constants';
import StickerPanel from './StickerPanel';

// Fonts loaded by index.html. Each entry pairs a display label with the
// CSS family string — the label uses the actual font in the dropdown so
// users can see what they're choosing.
const FONT_LIST = [
  { label: 'DM Sans',          css: '"DM Sans", system-ui, sans-serif' },
  { label: 'Outfit',           css: '"Outfit", system-ui, sans-serif' },
  { label: 'Bebas Neue',       css: '"Bebas Neue", Impact, sans-serif' },
  { label: 'Anton',            css: '"Anton", Impact, sans-serif' },
  { label: 'Oswald',           css: '"Oswald", "Arial Narrow", sans-serif' },
  { label: 'Playfair Display', css: '"Playfair Display", Georgia, serif' },
  { label: 'Pacifico',         css: '"Pacifico", cursive' },
  { label: 'Dancing Script',   css: '"Dancing Script", cursive' },
  { label: 'Lobster',          css: '"Lobster", cursive' },
  { label: 'Caveat',           css: '"Caveat", cursive' },
  { label: 'Permanent Marker', css: '"Permanent Marker", cursive' },
  { label: 'Shadows Into Light', css: '"Shadows Into Light", cursive' },
  { label: 'Press Start 2P',   css: '"Press Start 2P", monospace' },
  { label: 'Roboto Mono',      css: '"Roboto Mono", monospace' },
  { label: 'Georgia',          css: 'Georgia, serif' },
  { label: 'Impact',           css: 'Impact, sans-serif' },
  { label: 'Courier New',      css: '"Courier New", monospace' },
  { label: 'Arial',            css: 'Arial, sans-serif' },
];

// Backwards-compat: pick a sensible default for older saved text items.
const DEFAULT_TEXT = Object.freeze({
  text: 'Your Text',
  color: '#ffffff',
  size: 36,
  font: FONT_LIST[0].css,
  bold: false,
  italic: false,
  shadow: true,
  strokeColor: '#000000',
  strokeWidth: 0,
  opacity: 100,
  rotation: 0,
  letterSpacing: 0,
  align: 'center',
  x: 50,
  y: 30,
});

export default function TextPanel({
  texts, setTexts,
  stickers, setStickers,
  hasImage,
  activeLayer, setActiveLayer,
}) {
  // `userMode` is the user's last explicit pick (Text vs Sticker tag).
  // `mode` is what's actually rendered — DERIVED from selection + userMode.
  // Selecting a text layer on canvas auto-switches the panel to Text mode;
  // selecting a sticker switches to Sticker. Both without violating the
  // "no setState in effect" rule, since the derivation happens at render time.
  const [userMode, setUserMode] = useState('text');
  const mode = activeLayer?.type === 'sticker' ? 'sticker'
             : activeLayer?.type === 'text'    ? 'text'
             : userMode;

  // Sub-tab tap: also drop any selection of the *other* type so the
  // derivation above doesn't ignore the tap.
  const setMode = (m) => {
    setUserMode(m);
    if (activeLayer && activeLayer.type !== m) setActiveLayer?.(null);
  };

  // ── Editing the selected text layer? ──────────────────────
  const editingText = activeLayer?.type === 'text'
    ? texts.find(t => t.id === activeLayer.id)
    : null;

  // Local form state — used when composing a new layer. When a text layer is
  // selected, we edit it directly instead of going through this state.
  const [draft, setDraft] = useState(DEFAULT_TEXT);

  // Helper: read a field from the selected layer if editing, else from draft.
  const val = (key) => editingText ? (editingText[key] ?? DEFAULT_TEXT[key]) : draft[key];

  // Helper: write a field. When editing, patch the layer in-place (live update).
  // When composing, update the draft form.
  const set = (key, value) => {
    if (editingText) {
      setTexts(prev => prev.map(t => t.id === editingText.id ? { ...t, [key]: value } : t));
    } else {
      setDraft(d => ({ ...d, [key]: value }));
    }
  };

  // ── Compose: add a new text layer using draft values ──────
  const addText = () => {
    const trimmed = (draft.text || '').trim();
    if (!trimmed) return;
    const layer = { ...DEFAULT_TEXT, ...draft, text: trimmed, id: nextId('txt') };
    setTexts(p => [...p, layer]);
    setActiveLayer?.({ type: 'text', id: layer.id });
    // Don't blow away the draft — let the user keep iterating styles.
  };

  // Quick "© Watermark" template.
  const addWatermark = () => {
    const layer = {
      ...DEFAULT_TEXT,
      text: '© Your Name',
      size: 22,
      font: FONT_LIST[0].css,
      x: 88, y: 94,
      shadow: true,
      id: nextId('wm'),
    };
    setTexts(p => [...p, layer]);
    setActiveLayer?.({ type: 'text', id: layer.id });
  };

  const removeSelected = () => {
    if (!editingText) return;
    setTexts(prev => prev.filter(t => t.id !== editingText.id));
    setActiveLayer?.(null);
  };

  const duplicateSelected = () => {
    if (!editingText) return;
    const copy = {
      ...editingText,
      id: nextId('txt'),
      x: Math.min(95, (editingText.x || 50) + 4),
      y: Math.min(95, (editingText.y || 30) + 4),
    };
    setTexts(p => [...p, copy]);
    setActiveLayer?.({ type: 'text', id: copy.id });
  };

  // ── Sticker mode: add a sticker layer ─────────────────────
  const addSticker = (char) => {
    const layer = {
      id: nextId('stk'),
      emoji: char,
      size: 56,
      x: 50, y: 50,
      rotation: 0,
      opacity: 100,
    };
    setStickers(p => [...p, layer]);
    setActiveLayer?.({ type: 'sticker', id: layer.id });
  };

  // ── Editing a selected sticker (rotation + opacity + size) ──
  const editingSticker = activeLayer?.type === 'sticker'
    ? stickers.find(s => s.id === activeLayer.id)
    : null;
  const patchSticker = (patch) => {
    if (!editingSticker) return;
    setStickers(prev => prev.map(s => s.id === editingSticker.id ? { ...s, ...patch } : s));
  };
  const removeSticker = () => {
    if (!editingSticker) return;
    setStickers(prev => prev.filter(s => s.id !== editingSticker.id));
    setActiveLayer?.(null);
  };

  const previewFont = val('font');
  const previewColor = val('color');
  const previewBold = !!val('bold');
  const previewItalic = !!val('italic');
  const previewShadow = !!val('shadow');
  const previewStroke = (val('strokeWidth') || 0) > 0;

  return (
    <div>
      {/* Mode tabs */}
      <div className="pc-tt-modes">
        <Tag label="✏️ Text"    active={mode === 'text'}    onClick={() => setMode('text')} />
        <Tag label="😊 Sticker" active={mode === 'sticker'} onClick={() => setMode('sticker')} />
      </div>

      {/* ── TEXT MODE ────────────────────────────────────── */}
      {mode === 'text' && (
        <>
          {/* Status / selection chip */}
          <div className={`pc-edit-chip ${editingText ? 'on' : ''}`}>
            <span className="pc-edit-chip__dot" />
            <span className="pc-edit-chip__lbl">
              {editingText
                ? <>Editing: <strong>{editingText.text.slice(0, 28)}{editingText.text.length > 28 ? '…' : ''}</strong></>
                : 'New text — fill out the form and tap Add'}
            </span>
            {editingText && (
              <button
                type="button"
                className="pc-edit-chip__x"
                onClick={() => setActiveLayer?.(null)}
                aria-label="Deselect"
              >×</button>
            )}
          </div>

          {/* Live preview */}
          <div className="pc-text-preview" aria-hidden="true">
            <span style={{
              color: previewColor,
              fontFamily: previewFont,
              fontWeight: previewBold ? 700 : 400,
              fontStyle: previewItalic ? 'italic' : 'normal',
              fontSize: `${Math.min(32, val('size') / 1.4)}px`,
              textShadow: previewShadow ? '0 2px 8px rgba(0,0,0,0.85)' : 'none',
              WebkitTextStroke: previewStroke ? `${Math.min(2, val('strokeWidth') / 2)}px ${val('strokeColor')}` : '0',
              letterSpacing: `${val('letterSpacing') || 0}px`,
              opacity: (val('opacity') || 100) / 100,
              display: 'inline-block',
              transform: `rotate(${val('rotation') || 0}deg)`,
            }}>
              {(val('text') || 'Your Text').slice(0, 60) || 'Aa'}
            </span>
          </div>

          {/* Text content */}
          <SL>Content</SL>
          <textarea
            className="pc-text-area"
            value={val('text') || ''}
            onChange={(e) => set('text', e.target.value)}
            placeholder="Type your text here…"
            rows={2}
          />

          {/* Font family */}
          <SL>Font</SL>
          <select
            className="pc-text-fontsel"
            value={val('font')}
            onChange={(e) => set('font', e.target.value)}
            style={{ fontFamily: val('font') }}
          >
            {FONT_LIST.map(f => (
              <option key={f.css} value={f.css} style={{ fontFamily: f.css }}>{f.label}</option>
            ))}
          </select>

          {/* Style toggles */}
          <div className="pc-text-toggles">
            <button
              type="button"
              className={`pc-toggle ${val('bold') ? 'on' : ''}`}
              onClick={() => set('bold', !val('bold'))}
              title="Bold"
            ><b>B</b></button>
            <button
              type="button"
              className={`pc-toggle ${val('italic') ? 'on' : ''}`}
              onClick={() => set('italic', !val('italic'))}
              title="Italic"
            ><i>I</i></button>
            <button
              type="button"
              className={`pc-toggle ${val('shadow') ? 'on' : ''}`}
              onClick={() => set('shadow', !val('shadow'))}
              title="Drop shadow"
            >🌫️</button>
            <button
              type="button"
              className={`pc-toggle ${(val('strokeWidth') || 0) > 0 ? 'on' : ''}`}
              onClick={() => set('strokeWidth', (val('strokeWidth') || 0) > 0 ? 0 : 2)}
              title="Outline"
            >⭕</button>
          </div>

          {/* Alignment (matters only for multi-line text) */}
          <SL>Alignment</SL>
          <div className="pc-text-toggles">
            {[
              ['left',   '⬅️'],
              ['center', '⏺'],
              ['right',  '➡️'],
            ].map(([id, ico]) => (
              <button
                key={id}
                type="button"
                className={`pc-toggle ${val('align') === id ? 'on' : ''}`}
                onClick={() => set('align', id)}
                title={`Align ${id}`}
              >{ico}</button>
            ))}
          </div>

          {/* Color + outline color */}
          <div className="pc-text-rowctrls">
            <label>
              <span className="pc-rowctrl-lbl">Fill</span>
              <input type="color" value={val('color')} onChange={(e) => set('color', e.target.value)} />
            </label>
            <label>
              <span className="pc-rowctrl-lbl">Outline</span>
              <input
                type="color"
                value={val('strokeColor') || '#000000'}
                onChange={(e) => set('strokeColor', e.target.value)}
              />
            </label>
          </div>

          {/* Sliders */}
          <RangeRow label="Size"           value={val('size')}          onChange={(v) => set('size', v)}          min={10} max={160} unit="px" />
          {(val('strokeWidth') || 0) > 0 && (
            <RangeRow label="Outline Width" value={val('strokeWidth')}   onChange={(v) => set('strokeWidth', v)}   min={1}  max={12}  unit="px" />
          )}
          <RangeRow label="Letter Spacing" value={val('letterSpacing') || 0} onChange={(v) => set('letterSpacing', v)} min={-5} max={30} unit="px" />
          <RangeRow label="Rotation"       value={val('rotation') || 0} onChange={(v) => set('rotation', v)}      min={-180} max={180} unit="°" />
          <RangeRow label="Opacity"        value={val('opacity') ?? 100} onChange={(v) => set('opacity', v)}       min={10} max={100} unit="%" />

          {/* Action row */}
          {editingText ? (
            <div className="pc-text-actions">
              <Btn onClick={duplicateSelected} variant="ghost" size="sm">Duplicate</Btn>
              <Btn onClick={removeSelected} variant="danger" size="sm">{IC.Close} Delete</Btn>
            </div>
          ) : (
            <div className="pc-text-actions">
              <Btn onClick={addText} variant="primary" disabled={!hasImage || !(draft.text || '').trim()} size="sm" full>
                {IC.Text} Add Text
              </Btn>
              <Btn onClick={addWatermark} variant="ghost" disabled={!hasImage} size="sm">© Watermark</Btn>
            </div>
          )}
        </>
      )}

      {/* ── STICKER MODE ──────────────────────────────────── */}
      {mode === 'sticker' && (
        <>
          {/* Live editor for a selected sticker */}
          {editingSticker && (
            <>
              <div className="pc-edit-chip on">
                <span className="pc-edit-chip__dot" />
                <span className="pc-edit-chip__lbl">
                  Editing: <span style={{ fontSize: 16 }}>{editingSticker.emoji}</span>
                </span>
                <button
                  type="button"
                  className="pc-edit-chip__x"
                  onClick={() => setActiveLayer?.(null)}
                  aria-label="Deselect"
                >×</button>
              </div>
              <RangeRow label="Size"     value={editingSticker.size}                 onChange={(v) => patchSticker({ size: v })}      min={14}   max={360} unit="px" />
              <RangeRow label="Rotation" value={editingSticker.rotation || 0}        onChange={(v) => patchSticker({ rotation: v })}  min={-180} max={180} unit="°" />
              <RangeRow label="Opacity"  value={editingSticker.opacity ?? 100}        onChange={(v) => patchSticker({ opacity: v })}   min={10}   max={100} unit="%" />
              <div className="pc-text-actions">
                <Btn onClick={removeSticker} variant="danger" size="sm" full>{IC.Close} Delete sticker</Btn>
              </div>
              <HDivider />
            </>
          )}

          <StickerPanel onAdd={addSticker} hasImage={hasImage} />
        </>
      )}

      {/* ── Unified layer list — visible in both sub-modes ─ */}
      {(texts.length > 0 || stickers.length > 0) && (
        <>
          <HDivider />
          <SL>
            Layers ({texts.length + stickers.length})
            {(texts.length + stickers.length) > 1 && (
              <button
                type="button"
                onClick={() => {
                  setTexts([]); setStickers([]); setActiveLayer?.(null);
                }}
                style={{
                  marginLeft: 8, fontSize: 10, padding: '2px 8px',
                  background: 'transparent', color: 'var(--err)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6, cursor: 'pointer',
                  letterSpacing: '0.3px', textTransform: 'uppercase', fontWeight: 700,
                }}
              >Clear all</button>
            )}
          </SL>
          {texts.map(t => {
            const isSel = activeLayer?.type === 'text' && activeLayer?.id === t.id;
            // Try to recover the short font name from the CSS family string
            // so the row gives a useful preview even when the text is short.
            const fontShort = (t.font || '').split(',')[0].replace(/['"]/g, '').trim() || 'Default';
            return (
              <div
                key={t.id}
                className={`pc-text-li ${isSel ? 'on' : ''}`}
                onClick={() => setActiveLayer?.({ type: 'text', id: t.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveLayer?.({ type: 'text', id: t.id });
                  }
                }}
              >
                <span
                  className="pc-text-li__main"
                  style={{
                    color: t.color,
                    fontFamily: t.font,
                    fontWeight: t.bold ? 700 : 400,
                    fontStyle: t.italic ? 'italic' : 'normal',
                  }}
                >
                  {(t.text || '').trim() || '(empty)'}
                </span>
                <span className="pc-text-li__meta">{fontShort} · {Math.round(t.size)}px</span>
                <button
                  type="button"
                  className="pc-text-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTexts(p => p.filter(x => x.id !== t.id));
                    setActiveLayer?.(cur => (cur?.type === 'text' && cur?.id === t.id) ? null : cur);
                  }}
                  aria-label="Delete text"
                >{IC.Close}</button>
              </div>
            );
          })}
          {stickers.map(s => {
            const isSel = activeLayer?.type === 'sticker' && activeLayer?.id === s.id;
            return (
              <div
                key={s.id}
                className={`pc-text-li ${isSel ? 'on' : ''}`}
                onClick={() => setActiveLayer?.({ type: 'sticker', id: s.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveLayer?.({ type: 'sticker', id: s.id });
                  }
                }}
              >
                <span className="pc-text-li__main" style={{ fontSize: 18 }}>{s.emoji}</span>
                <span className="pc-text-li__meta">sticker · {Math.round(s.size)}px</span>
                <button
                  type="button"
                  className="pc-text-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStickers(p => p.filter(x => x.id !== s.id));
                    setActiveLayer?.(cur => (cur?.type === 'sticker' && cur?.id === s.id) ? null : cur);
                  }}
                  aria-label="Delete sticker"
                >{IC.Close}</button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
