// src/components/panels/StickerPanel.jsx
// Sticker library: category tabs + search + scrollable grid backed by
// `src/utils/emojiData.js`. Recently-used stickers are tracked in
// localStorage so the editor remembers favourites between sessions.

import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_CATEGORIES, searchEmojis } from '../../utils/emojiData';
import { SL } from '../ui';

const RECENT_KEY = 'pc.recentStickers';
const MAX_RECENT = 36;

function readRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch { return []; }
}
function writeRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch { /* private mode */ }
}

export default function StickerPanel({ onAdd, hasImage }) {
  const [activeCat, setActiveCat] = useState('smileys');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const scrollRef = useRef(null);

  // Reset scroll when switching category or searching so the user always sees
  // the top of the new set instead of being stranded mid-page.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeCat, query]);

  const list = useMemo(() => {
    if (query.trim()) {
      return { id: 'search', name: `Results for "${query.trim()}"`, emojis: searchEmojis(query) };
    }
    if (activeCat === 'recent') {
      return {
        id: 'recent',
        name: 'Recently used',
        emojis: recent.map(c => ({ c, n: 'recent' })),
      };
    }
    return EMOJI_CATEGORIES.find(c => c.id === activeCat) || EMOJI_CATEGORIES[0];
  }, [query, activeCat, recent]);

  const tabsWithRecent = useMemo(() => {
    const base = recent.length > 0
      ? [{ id: 'recent', name: 'Recent', icon: '🕒' }, ...EMOJI_CATEGORIES]
      : EMOJI_CATEGORIES;
    return base;
  }, [recent]);

  const handlePick = (char) => {
    if (!hasImage) return;
    onAdd?.(char);
    setRecent(prev => {
      const next = [char, ...prev.filter(c => c !== char)].slice(0, MAX_RECENT);
      writeRecent(next);
      return next;
    });
  };

  return (
    <div className="pc-sticker-lib">
      {/* Search */}
      <div className="pc-sticker-search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stickers (e.g. heart, cat, pizza)…"
          aria-label="Search stickers"
        />
        {query && (
          <button
            type="button"
            className="pc-sticker-search__clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >×</button>
        )}
      </div>

      {/* Category tabs (hidden during search to reduce noise) */}
      {!query && (
        <div className="pc-sticker-cats" role="tablist">
          {tabsWithRecent.map(c => (
            <button
              key={c.id}
              role="tab"
              aria-selected={activeCat === c.id}
              className={`pc-sticker-cat ${activeCat === c.id ? 'on' : ''}`}
              onClick={() => setActiveCat(c.id)}
              title={c.name}
            >
              <span aria-hidden="true">{c.icon}</span>
            </button>
          ))}
        </div>
      )}

      <SL>{list.name} {list.emojis.length > 0 && <span style={{ color: 'var(--t4)', fontWeight: 500 }}>· {list.emojis.length}</span>}</SL>

      {/* Grid */}
      <div ref={scrollRef} className="pc-sticker-scroll">
        {list.emojis.length === 0 ? (
          <p className="pc-hint" style={{ padding: '12px 4px' }}>
            {query ? 'No stickers match your search.' : 'No stickers in this section yet.'}
          </p>
        ) : (
          <div className="pc-sticker-grid">
            {list.emojis.map((item, i) => (
              <button
                key={`${item.c}-${i}`}
                type="button"
                className="pc-sticker-btn"
                onClick={() => handlePick(item.c)}
                disabled={!hasImage}
                title={item.n}
                aria-label={item.n}
              >
                {item.c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
