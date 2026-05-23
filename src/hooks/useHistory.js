// src/hooks/useHistory.js
import { useState, useCallback } from 'react';

/**
 * Deep-equal check for snap objects.
 *
 * Snaps are small ({ adj: {…~24 keys…}, tx: {…~7 keys…} }) so JSON.stringify
 * is fast enough and avoids hand-rolled comparators that drift when new
 * fields are added to either object. Reference-equal check first to short-
 * circuit the common case of "React handed us the same snap back".
 */
function snapEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

/**
 * useHistory — Manages undo/redo stack for editor state.
 * Uses atomic functional updates so concurrent pushes never desync
 * cursor and stack (the previous closure-based version was racy).
 *
 * Push **deduplicates**: if the new snapshot is content-equal to the
 * snap currently at the top of the live history, the push is dropped.
 * Without this, real-world flows quietly inserted duplicate snaps:
 *
 *   • Touch devices: sliders carry both onMouseUp AND onTouchEnd, and
 *     mobile browsers fire BOTH for one tap-release → two identical
 *     commits per release. First Undo lands on the dup (no visible
 *     change); user had to click Undo twice. **This is the main bug
 *     the user reported.**
 *
 *   • Slider dragged to value X then back to original Y before release.
 *
 *   • doneCrop / enhancePhoto push the current (adj, tx) after replacing
 *     imageSrc — the snap content matches the previous one.
 *
 *   • Reset arrow on an already-default slider, applyPreset with the
 *     same preset, etc.
 *
 * Skipping the duplicate keeps the redo tail intact (a noop "edit" isn't
 * a new branch) and guarantees a single Undo click always produces a
 * visible change.
 *
 * @param {Object} initial   — initial snapshot
 * @param {number} maxSteps  — max history length (default 50)
 */
export default function useHistory(initial, maxSteps = 50) {
  const [state, setState] = useState({ stack: [initial], cursor: 0 });

  const { stack, cursor } = state;
  const canUndo = cursor > 0;
  const canRedo = cursor < stack.length - 1;
  const current = stack[cursor];

  /** Push a new snapshot — drops the redo tail and trims to maxSteps. */
  const push = useCallback((snapshot) => {
    setState(prev => {
      // ── Dedup: if content matches the live top, this push is a noop ──
      if (snapEqual(prev.stack[prev.cursor], snapshot)) {
        return prev;
      }
      const trimmed = prev.stack.slice(0, prev.cursor + 1);
      let next = [...trimmed, snapshot];
      let nextCursor = next.length - 1;
      if (next.length > maxSteps) {
        const drop = next.length - maxSteps;
        next = next.slice(drop);
        nextCursor = next.length - 1;
      }
      return { stack: next, cursor: nextCursor };
    });
  }, [maxSteps]);

  const undo = useCallback(() => {
    setState(prev => prev.cursor > 0
      ? { ...prev, cursor: prev.cursor - 1 }
      : prev);
  }, []);

  const redo = useCallback(() => {
    setState(prev => prev.cursor < prev.stack.length - 1
      ? { ...prev, cursor: prev.cursor + 1 }
      : prev);
  }, []);

  /** Clear history and reset to a new initial snapshot. */
  const clear = useCallback((newInitial) => {
    setState({ stack: [newInitial], cursor: 0 });
  }, []);

  return {
    current, push, undo, redo, clear,
    canUndo, canRedo, historyLength: stack.length,
  };
}
