// src/constants/icons.jsx
// Central icon registry. Backed by react-icons (Lucide) for a consistent,
// professional look. Each entry is a ready-to-render React element, so call
// sites can keep writing `{IC.Foo}` without changes.

import {
  LuUpload, LuSave, LuCrop, LuCheck, LuRotateCcw, LuRotateCw,
  LuUndo2, LuRedo2, LuZoomIn, LuZoomOut, LuMaximize, LuArrowLeftRight,
  LuFlipHorizontal2, LuFlipVertical2, LuType, LuX, LuImage, LuDownload,
  LuSlidersHorizontal, LuLayers, LuFrame, LuSparkles, LuSticker,
  LuPalette, LuLayoutGrid, LuInfo, LuSun, LuLoaderCircle,
} from 'react-icons/lu';

const ic = (Component, size = 16) => <Component size={size} strokeWidth={2} />;

export const IC = {
  Upload:   ic(LuUpload, 16),
  Save:     ic(LuSave, 16),
  Crop:     ic(LuCrop, 14),
  Check:    ic(LuCheck, 14),
  Reset:    ic(LuRotateCcw, 14),
  Undo:     ic(LuUndo2, 14),
  Redo:     ic(LuRedo2, 14),
  ZoomIn:   ic(LuZoomIn, 14),
  ZoomOut:  ic(LuZoomOut, 14),
  Fit:      ic(LuMaximize, 14),
  Compare:  ic(LuArrowLeftRight, 14),
  RotL:     ic(LuRotateCcw, 18),
  RotR:     ic(LuRotateCw, 18),
  FlipH:    ic(LuFlipHorizontal2, 18),
  FlipV:    ic(LuFlipVertical2, 18),
  Text:     ic(LuType, 14),
  Close:    ic(LuX, 13),
  ImgPh:    ic(LuImage, 34),
  Download: ic(LuDownload, 16),
  Sliders:  ic(LuSlidersHorizontal, 14),
  Layers:   ic(LuLayers, 14),
  Frame:    ic(LuFrame, 14),
  Sparkle:  ic(LuSparkles, 14),
  Sticker:  ic(LuSticker, 14),
  Palette:  ic(LuPalette, 14),
  Grid:     ic(LuLayoutGrid, 13),
  Info:     ic(LuInfo, 13),
  Sun:      ic(LuSun, 13),
  Spinner:  <LuLoaderCircle size={16} strokeWidth={2} className="pc-spin" />,
};
