import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../services/api";
import {
  NOTE_EMOJIS,
  NOTE_PLACES,
  NOTE_STICKERS,
  NOTE_TRACKS,
  formatTrack,
} from "./catalog";

const ALL_TABS = [
  { id: "emoji", label: "Emoji" },
  { id: "sticker", label: "Stiker" },
  { id: "music", label: "Musiqi" },
  { id: "location", label: "Məkan" },
];

/**
 * Paylaşılan seçici — chat, şərh, hekayə, canlı, note.
 * onPick({ kind, text, meta })
 */
export default function ExpressionPicker({
  tabs = ["emoji", "sticker", "music", "location"],
  initialTab,
  onPick,
  className = "",
}) {
  const allowed = ALL_TABS.filter((t) => tabs.includes(t.id));
  const [tab, setTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : allowed[0]?.id || "emoji");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState(NOTE_PLACES);
  const timer = useRef(0);

  useEffect(() => {
    if (!allowed.some((t) => t.id === tab)) setTab(allowed[0]?.id || "emoji");
  }, [tabs.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const tracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NOTE_TRACKS;
    return NOTE_TRACKS.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.mood.includes(q)
    );
  }, [query]);

  const stickers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NOTE_STICKERS;
    return NOTE_STICKERS.filter((s) => s.label.toLowerCase().includes(q) || s.pack.includes(q));
  }, [query]);

  useEffect(() => {
    if (tab !== "location") return undefined;
    window.clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      setPlaces(NOTE_PLACES);
      return undefined;
    }
    timer.current = window.setTimeout(() => {
      api
        .get("/api/search", { params: { q, type: "location" } })
        .then((data) => {
          const found = Array.isArray(data?.locations) ? data.locations.filter(Boolean) : [];
          const local = NOTE_PLACES.filter((p) => p.toLowerCase().includes(q.toLowerCase()));
          setPlaces([...new Set([...found, ...local])].slice(0, 24));
        })
        .catch(() => setPlaces(NOTE_PLACES.filter((p) => p.toLowerCase().includes(q.toLowerCase()))));
    }, 280);
    return () => window.clearTimeout(timer.current);
  }, [tab, query]);

  return (
    <div className={`expr-picker ${className}`.trim()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="expr-tabs">
        {allowed.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "is-on" : ""}
            onClick={() => {
              setTab(item.id);
              setQuery("");
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "emoji" ? (
        <div className="expr-emoji-grid">
          {NOTE_EMOJIS.map((emo) => (
            <button key={emo} type="button" onClick={() => onPick?.({ kind: "emoji", text: emo })} aria-label={emo}>
              {emo}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "sticker" ? (
        <>
          <input className="expr-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Stiker axtar" />
          <div className="expr-sticker-grid">
            {stickers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick?.({ kind: "sticker", text: item.face, meta: item })}
              >
                <span>{item.face}</span>
                <small>{item.label}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {tab === "music" ? (
        <>
          <input className="expr-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mahnı və ya ifaçı axtar" />
          <div className="expr-list">
            {tracks.map((track) => (
              <button
                key={track.id}
                type="button"
                className="expr-list-item"
                onClick={() => onPick?.({
                  kind: "music",
                  text: formatTrack(track),
                  meta: track,
                })}
              >
                <span className="expr-ico">♫</span>
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {tab === "location" ? (
        <>
          <input className="expr-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Məkan axtar" />
          <div className="expr-list">
            {places.map((place) => (
              <button
                key={place}
                type="button"
                className="expr-list-item"
                onClick={() => onPick?.({ kind: "location", text: place })}
              >
                <span className="expr-ico">⌖</span>
                <span>
                  <strong>{place}</strong>
                  <small>Məkan</small>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Composer düyməsi + popover */
export function ExpressionButton({
  tabs,
  initialTab,
  onPick,
  label = "😊",
  title = "Emoji, stiker, musiqi, məkan",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`expr-attach ${className}`.trim()}>
      <button
        type="button"
        className={`expr-toggle${open ? " is-on" : ""}`}
        title={title}
        aria-label={title}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open ? (
        <div className="expr-pop">
          <ExpressionPicker
            tabs={tabs}
            initialTab={initialTab}
            onPick={(payload) => {
              onPick?.(payload);
              if (payload.kind === "emoji" || payload.kind === "sticker") {
                /* emoji/stiker insert üçün açıq qalsın */
              } else {
                setOpen(false);
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function insertAtCursor(inputRef, value, text, setText) {
  const el = inputRef?.current;
  const start = el?.selectionStart ?? text.length;
  const end = el?.selectionEnd ?? text.length;
  const next = `${text.slice(0, start)}${value}${text.slice(end)}`;
  setText(next);
  const pos = start + value.length;
  requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange?.(pos, pos);
  });
}
