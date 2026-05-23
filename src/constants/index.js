// src/constants/index.js
// All app-wide constants, config arrays, and pure utility functions

// ═══════════════════════════════════════════════════════════
// TABS CONFIG
// ═══════════════════════════════════════════════════════════
export const TABS = ['Light', 'Color', 'Detail', 'Effects', 'Filters', 'Crop', 'Transform', 'Text', 'Export'];

export const TAB_ICONS = {
  Light:     '☀️',
  Color:     '🎨',
  Detail:    '🔬',
  Effects:   '✨',
  Filters:   '🌈',
  Crop:      '✂️',
  Transform: '↕️',
  Text:      '📝',
  Export:    '💾',
};

// ═══════════════════════════════════════════════════════════
// MONOTONIC ID GENERATOR
// Avoids Date.now() collisions when adding multiple overlays
// in the same millisecond (rapid clicks / synthesised tests).
// ═══════════════════════════════════════════════════════════
let __pcIdCounter = 0;
export function nextId(prefix = 'id') {
  __pcIdCounter += 1;
  // Combine timestamp with counter so IDs remain roughly sortable
  // and survive component remounts during HMR.
  return `${prefix}_${Date.now().toString(36)}_${__pcIdCounter.toString(36)}`;
}

// ═══════════════════════════════════════════════════════════
// ADJUSTMENT GROUPS
// ═══════════════════════════════════════════════════════════
export const LIGHT_ADJUSTMENTS = [
  { key: 'brightness', label: 'Brightness', icon: '☀️', min: 0,    max: 200, default: 100, unit: '%'  },
  { key: 'contrast',   label: 'Contrast',   icon: '◐',  min: 0,    max: 200, default: 100, unit: '%'  },
  { key: 'exposure',   label: 'Exposure',   icon: '💡', min: -100, max: 100, default: 0,   unit: ''   },
  { key: 'highlights', label: 'Highlights', icon: '🔆', min: -100, max: 100, default: 0,   unit: ''   },
  { key: 'shadows',    label: 'Shadows',    icon: '🔅', min: -100, max: 100, default: 0,   unit: ''   },
  { key: 'whites',     label: 'Whites',     icon: '⬜', min: -100, max: 100, default: 0,   unit: ''   },
  { key: 'blacks',     label: 'Blacks',     icon: '⬛', min: -100, max: 100, default: 0,   unit: ''   },
];

export const COLOR_ADJUSTMENTS = [
  { key: 'saturate',     label: 'Saturation',   icon: '💧', min: 0,    max: 300, default: 100, unit: '%' },
  { key: 'vibrance',     label: 'Vibrance',     icon: '🌈', min: -100, max: 100, default: 0,   unit: ''  },
  { key: 'hue',          label: 'Hue',          icon: '🎡', min: 0,    max: 360, default: 0,   unit: '°' },
  { key: 'temperature',  label: 'Temperature',  icon: '🌡️', min: -100, max: 100, default: 0,   unit: ''  },
  { key: 'tint',         label: 'Tint',         icon: '🎨', min: -100, max: 100, default: 0,   unit: ''  },
  { key: 'sepia',        label: 'Warmth',       icon: '🌅', min: 0,    max: 100, default: 0,   unit: '%' },
];

export const DETAIL_ADJUSTMENTS = [
  { key: 'blur',     label: 'Blur',     icon: '🌫️', min: 0, max: 20,  default: 0, unit: 'px' },
  { key: 'sharpen',  label: 'Sharpen',  icon: '🔪', min: 0, max: 100, default: 0, unit: ''   },
  { key: 'clarity',  label: 'Clarity',  icon: '💎', min: 0, max: 100, default: 0, unit: ''   },
  { key: 'noise',    label: 'Denoise',  icon: '📡', min: 0, max: 100, default: 0, unit: ''   },
];

export const EFFECTS_ADJUSTMENTS = [
  { key: 'vignette',     label: 'Vignette',  icon: '🔲', min: 0,   max: 100, default: 0,   unit: '%' },
  { key: 'grain',        label: 'Grain',     icon: '🌾', min: 0,   max: 100, default: 0,   unit: '%' },
  { key: 'fade',         label: 'Fade',      icon: '👻', min: 0,   max: 100, default: 0,   unit: '%' },
  { key: 'grayscale',    label: 'B & W',     icon: '📷', min: 0,   max: 100, default: 0,   unit: '%' },
  { key: 'invert',       label: 'Invert',    icon: '🔄', min: 0,   max: 100, default: 0,   unit: '%' },
  { key: 'glow',         label: 'Glow',      icon: '✨', min: 0,   max: 50,  default: 0,   unit: 'px'},
  { key: 'opacity',      label: 'Opacity',   icon: '🫧', min: 10,  max: 100, default: 100, unit: '%' },
];

export const ALL_ADJUSTMENTS = [
  ...LIGHT_ADJUSTMENTS,
  ...COLOR_ADJUSTMENTS,
  ...DETAIL_ADJUSTMENTS,
  ...EFFECTS_ADJUSTMENTS,
];

export const DEFAULT_ADJ = Object.fromEntries(ALL_ADJUSTMENTS.map(a => [a.key, a.default]));

// ═══════════════════════════════════════════════════════════
// PRESET FILTERS
// ═══════════════════════════════════════════════════════════
export const PRESET_FILTERS = [
  { name: 'Original', values: {} },
  { name: 'Vivid',    values: { saturate: 180, contrast: 115, brightness: 105 } },
  { name: 'Chrome',   values: { contrast: 130, saturate: 120, brightness: 108 } },
  { name: 'Fade',     values: { fade: 25, brightness: 115, contrast: 85, saturate: 75 } },
  { name: 'Noir',     values: { grayscale: 100, contrast: 140, brightness: 90 } },
  { name: 'Warm',     values: { sepia: 40, saturate: 120, brightness: 105, temperature: 30 } },
  { name: 'Cool',     values: { hue: 200, saturate: 110, brightness: 102, temperature: -30 } },
  { name: 'Drama',    values: { contrast: 160, saturate: 140, brightness: 90, vignette: 40 } },
  { name: 'Sunset',   values: { sepia: 55, saturate: 160, brightness: 110, hue: 15 } },
  { name: 'Matte',    values: { contrast: 75, brightness: 115, saturate: 88, fade: 15 } },
  { name: 'Lomo',     values: { contrast: 150, saturate: 130, vignette: 55, brightness: 95 } },
  { name: 'Vintage',  values: { sepia: 75, contrast: 88, brightness: 108, grain: 20 } },
  { name: 'Cinematic',values: { contrast: 120, saturate: 85, brightness: 95, temperature: -10, vignette: 30 } },
  { name: 'Pastel',   values: { saturate: 60, brightness: 120, contrast: 85, fade: 20 } },
  { name: 'Punch',    values: { contrast: 145, saturate: 160, brightness: 98, clarity: 30 } },
  { name: 'Portrait', values: { brightness: 108, contrast: 95, saturate: 90, fade: 8 } },
  // — Added in v2 —
  { name: 'Forest',   values: { hue: 80,  saturate: 130, brightness: 100, contrast: 110, temperature: -8 } },
  { name: 'Beach',    values: { brightness: 112, saturate: 125, temperature: 18, contrast: 105, clarity: 12 } },
  { name: 'Urban',    values: { contrast: 130, saturate: 95,  brightness: 96,  temperature: -15, clarity: 22 } },
  { name: 'Mono',     values: { grayscale: 100, contrast: 120, brightness: 102, clarity: 18 } },
  { name: 'Sepia',    values: { sepia: 100, contrast: 105, brightness: 102, saturate: 90 } },
  { name: 'Cyber',    values: { hue: 280, saturate: 200, contrast: 130, brightness: 95 } },
  { name: 'Polaroid', values: { brightness: 110, contrast: 92, saturate: 88, fade: 18, sepia: 12 } },
  { name: 'HDR',      values: { contrast: 135, saturate: 130, clarity: 35, sharpen: 25, brightness: 102 } },
];

// ═══════════════════════════════════════════════════════════
// ASPECT RATIOS
// ═══════════════════════════════════════════════════════════
export const ASPECT_RATIOS = [
  { label: 'Free',  ratio: NaN   },
  { label: '1:1',   ratio: 1     },
  { label: '4:3',   ratio: 4/3   },
  { label: '16:9',  ratio: 16/9  },
  { label: '3:4',   ratio: 3/4   },
  { label: '9:16',  ratio: 9/16  },
  { label: '2:3',   ratio: 2/3   },
  { label: '3:2',   ratio: 3/2   },
  { label: '5:4',   ratio: 5/4   },
  { label: '7:5',   ratio: 7/5   },
];

// ═══════════════════════════════════════════════════════════
// EXPORT FORMATS
// ═══════════════════════════════════════════════════════════
export const EXPORT_FORMATS = [
  { value: 'png',  label: 'PNG',  mime: 'image/png',  quality: false },
  { value: 'jpg',  label: 'JPEG', mime: 'image/jpeg', quality: true  },
  { value: 'webp', label: 'WebP', mime: 'image/webp', quality: true  },
];

// ═══════════════════════════════════════════════════════════
// FRAME OPTIONS
// ═══════════════════════════════════════════════════════════
export const FRAME_OPTIONS = [
  { id: 'none',   label: 'None' },
  { id: 'white',  label: 'White' },
  { id: 'black',  label: 'Black' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'film',   label: 'Film' },
];

// ═══════════════════════════════════════════════════════════
// BUILD CSS FILTER STRING
// ═══════════════════════════════════════════════════════════
export function buildFilter(a) {
  // Light calculations
  const brt = Math.max(0, Math.min(400,
    a.brightness
    + (a.exposure   || 0) * 0.8
    + (a.highlights || 0) * 0.25
    + (a.whites     || 0) * 0.15
  ));
  const ctr = Math.max(0, Math.min(400,
    a.contrast
    + (a.shadows || 0) * 0.3
    + (a.blacks  || 0) * 0.2
    + (a.clarity || 0) * 0.5
    + (a.sharpen || 0) * 0.3
  ));

  // Color calculations
  const sat = Math.max(0, Math.min(500,
    a.saturate + (a.vibrance || 0) * 0.6
  ));
  const hueRot = (a.hue || 0) + (a.tint || 0) * 0.5;
  const sep = Math.max(0, Math.min(100,
    (a.sepia || 0) + Math.max(0, (a.temperature || 0)) * 0.4
  ));

  // Effects
  const opac = Math.max(0, Math.min(100,
    (a.opacity || 100) - (a.fade || 0) * 0.5
  ));

  return [
    `brightness(${brt}%)`,
    `contrast(${ctr}%)`,
    `saturate(${sat}%)`,
    `hue-rotate(${hueRot}deg)`,
    `sepia(${sep}%)`,
    `blur(${a.blur || 0}px)`,
    `grayscale(${a.grayscale || 0}%)`,
    `invert(${a.invert || 0}%)`,
    `opacity(${opac}%)`,
    `drop-shadow(0 0 ${a.glow || 0}px rgba(255,200,100,0.8))`,
  ].join(' ');
}

export function buildVignette(pct) {
  if (!pct) return 'none';
  const sp = Math.round(pct * 2.2);
  return `radial-gradient(ellipse at center, transparent ${Math.max(0, 100 - sp)}%, rgba(0,0,0,${Math.min(0.92, (pct / 100) * 0.9)}) 100%)`;
}

export function buildGrainStyle(grainPct) {
  if (!grainPct) return {};
  const opacity = (grainPct / 100) * 0.45;
  return {
    position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: '4px',
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
    backgroundSize: '180px 180px',
    opacity,
    mixBlendMode: 'overlay',
  };
}

// ═══════════════════════════════════════════════════════════
// FRAME STYLE BUILDER
// ═══════════════════════════════════════════════════════════
export function buildFrameStyle(frame) {
  if (!frame || frame.type === 'none') return {};
  const w = frame.width || 20;
  switch (frame.type) {
    case 'white':    return { outline: `${w}px solid #ffffff`, outlineOffset: `-${w}px` };
    case 'black':    return { outline: `${w}px solid #000000`, outlineOffset: `-${w}px` };
    case 'shadow':   return { boxShadow: `inset 0 0 ${w * 3}px rgba(0,0,0,0.7)` };
    case 'polaroid': return { padding: `${w}px ${w}px ${w * 3}px ${w}px`, background: '#fff' };
    case 'film':     return { outline: `${w}px solid #111`, outlineOffset: `-${w}px`, filter: 'contrast(1.05)' };
    default: return {};
  }
}