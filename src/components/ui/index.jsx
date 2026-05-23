// src/components/ui/index.jsx
// All reusable UI primitives

import { useMemo } from 'react';

// ═══════════════════════════════════════════════════════════
// ADJUSTMENT SLIDER
// ═══════════════════════════════════════════════════════════
export function AdjSlider({ adj, value, onChange, onCommit, disabled }) {
  const pct     = ((value - adj.min) / (adj.max - adj.min)) * 100;
  const changed = value !== adj.default;
  return (
    <div className="pc-srow">
      <div className="pc-shead">
        <div className="pc-slabel">
          <span className="pc-slabel__ico">{adj.icon}</span>
          <span className={`pc-slabel__txt ${changed ? 'chg' : ''}`}>{adj.label}</span>
          {changed && <div className="pc-sdot" />}
        </div>
        <div className="pc-sval">
          <span className={`pc-sval__num ${changed ? 'chg' : ''}`}>
            {Math.round(value)}{adj.unit}
          </span>
          {changed && (
            <button
              className="pc-sreset"
              onClick={() => { onChange(adj.default); onCommit?.(adj.key, adj.default); }}
              title="Reset"
            >
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="pc-strack">
        <div className="pc-strack__bg" />
        <div className={`pc-strack__fill ${changed ? 'chg' : 'def'}`} style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={adj.min} max={adj.max} value={value}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          onMouseUp={e => onCommit?.(adj.key, Number(e.target.value))}
          onTouchEnd={e => onCommit?.(adj.key, Number(e.target.value))}
          className="pc-strack__input"
        />
        <div className={`pc-strack__thumb ${changed ? 'chg' : 'def'}`} style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FILTER CARD (grid version + row version)
// ═══════════════════════════════════════════════════════════
import { buildFilter, DEFAULT_ADJ } from '../../constants';

export function FilterCard({ preset, active, imgSrc, onClick, size = 68 }) {
  const fs = useMemo(
    () => buildFilter({ ...DEFAULT_ADJ, ...preset.values }),
    [preset.values]
  );
  return (
    <button className="pc-fc" onClick={onClick}>
      <div className={`pc-fc__thumb ${active ? 'on' : ''}`} style={{ width: size, height: size }}>
        {imgSrc
          ? <img src={imgSrc} alt={preset.name} style={{ filter: fs }} />
          : <div style={{ filter: fs }} />
        }
      </div>
      <span className={`pc-fc__name ${active ? 'on' : ''}`}>{preset.name}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// ICON BUTTON
// ═══════════════════════════════════════════════════════════
export function IBtn({
  onClick,
  children,
  title,
  active,
  disabled,
  size = 36,
  className = '',
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchEnd,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      className={`pc-ib pc-ib-${size} ${active ? 'active' : ''} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// ACTION BUTTON
// ═══════════════════════════════════════════════════════════
export function Btn({ onClick, children, variant = 'ghost', disabled, full, size = 'md', type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`pc-btn pc-btn-${variant} pc-btn-${size} ${full ? 'pc-btn-full' : ''}`}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// TAG / PILL
// ═══════════════════════════════════════════════════════════
export function Tag({ label, active, onClick }) {
  return (
    <button className={`pc-tag ${active ? 'on' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION LABEL
// ═══════════════════════════════════════════════════════════
export function SL({ children, style }) {
  return <p className="pc-sl" style={style}>{children}</p>;
}

// ═══════════════════════════════════════════════════════════
// DIVIDER
// ═══════════════════════════════════════════════════════════
export function HDivider({ style }) {
  return <div className="pc-hdivider" style={style} />;
}

// ═══════════════════════════════════════════════════════════
// RANGE INPUT (generic, used in export panel etc.)
// ═══════════════════════════════════════════════════════════
export function RangeRow({ label, value, onChange, min, max, unit = '' }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div className="pc-exp-label">
        <span>{label}</span>
        <span>{value}{unit}</span>
      </div>
      <div className="pc-strack">
        <div className="pc-strack__bg" />
        <div className="pc-strack__fill chg" style={{ width: `${pct}%` }} />
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="pc-strack__input"
        />
        <div className="pc-strack__thumb chg" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}