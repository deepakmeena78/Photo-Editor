import './styles/editor.css';
import useImageEditor from './hooks/useImageEditor';
import Header         from './components/editor/Header';
import Canvas         from './components/editor/Canvas';
import { Sidebar, MobilePanel } from './components/editor/PanelLayout';

// ═══════════════════════════════════════════════════════════
export default function ImageEditor() {
  const editor = useImageEditor();

  const {
    // lifecycle
    loading,
    // image
    imageSrc, origSrc, imgRef, fileRef, imgNatural, fileName, isModified,
    // visual
    filterStr, vigGrad, transformStr, hasImage,
    adj, tx, texts, setTexts, stickers, setStickers,
    activeLayer, setActiveLayer,
    // crop
    isCropping,
    // ui state
    activeTab, setActiveTab, showBefore, setShowBefore, showGrid, setShowGrid,
    isSaving, toastMsg,
    // history
    canUndo, canRedo, undo, redo, resetAll,
    // handlers
    handleFile, handleDrop, handleSave,
    // zoom / pan
    setZoom, panBy, zoomAt,
  } = editor;

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="pc-loading">
        <div className="pc-loading__logo">PixelCraft</div>
        <div className="pc-loading__bar-track">
          <div className="pc-loading__bar" />
        </div>
        <p className="pc-loading__tagline">Professional Photo Editor</p>
        <p className="pc-loading__credit">Made By Deepak (Ankit) Meena</p>
      </div>
    );
  }

  // ── State object passed to panels ─────────────────────────
  // (single prop instead of dozens of individual props)
  const panelState = { ...editor };

  // ── Main render ───────────────────────────────────────────
  return (
    <div className="pc-app">

      {/* ══ HEADER ══ */}
      <Header
        fileName={fileName}
        hasImage={hasImage}
        isCropping={isCropping}
        isSaving={isSaving}
        canUndo={canUndo}
        canRedo={canRedo}
        undo={undo}
        redo={redo}
        setZoom={setZoom}
        showBefore={showBefore}
        setShowBefore={setShowBefore}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        handleSave={handleSave}
        openFile={() => fileRef.current?.click()}
        isModified={isModified}
        resetAll={resetAll}
      />

      {/* ══ BODY ══ */}
      <div className="pc-body">

        {/* ── Desktop Sidebar ── */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          state={panelState}
        />

        {/* ── Canvas ── */}
        <Canvas
          imageSrc={imageSrc}
          origSrc={origSrc}
          imgRef={imgRef}
          filterStr={filterStr}
          vigGrad={vigGrad}
          transformStr={transformStr}
          isCropping={isCropping}
          showBefore={showBefore}
          showGrid={showGrid}
          hasImage={hasImage}
          adj={adj}
          texts={texts}
          setTexts={setTexts}
          stickers={stickers}
          setStickers={setStickers}
          zoom={tx.zoom}
          imgNatural={imgNatural}
          isModified={isModified}
          handleDrop={handleDrop}
          openFile={() => fileRef.current?.click()}
          isSaving={isSaving}
          panBy={panBy}
          zoomAt={zoomAt}
          activeLayer={activeLayer}
          setActiveLayer={setActiveLayer}
        />

        {/* ── Mobile Bottom Panel ── */}
        <MobilePanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          state={panelState}
        />

      </div>

      {/* ── Toast notification ── */}
      {toastMsg && (
        <div className="pc-toast">{toastMsg}</div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}