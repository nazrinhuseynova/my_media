import { useEffect, useState } from "react";
import { boot } from "./engine";
import { LANGUAGES } from "./languages";
import { useLanguage } from "./useLanguage";

export default function LanguageRoot({ children }) {
  const open = useLanguage((s) => s.open);
  const hide = useLanguage((s) => s.hide);
  const pick = useLanguage((s) => s.pick);
  const code = useLanguage((s) => s.code);
  const busy = useLanguage((s) => s.busy);
  const [query, setQuery] = useState("");

  useEffect(() => {
    boot();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event) {
      if (event.key === "Escape" && !busy) hide();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, hide, busy]);

  const needle = query.trim().toLocaleLowerCase();
  const rows = LANGUAGES.filter((item) => !needle || item.name.toLocaleLowerCase().includes(needle) || item.label.toLocaleLowerCase().includes(needle));

  return (
    <>
      {children}
      {open ? (
        <div className="lang-layer" onClick={() => { if (!busy) hide(); }}>
          <div className="lang-sheet" role="dialog" aria-modal="true" aria-labelledby="lang-title" onClick={(event) => event.stopPropagation()}>
            <div className="lang-head">
              <h2 id="lang-title">Dil</h2>
              <button type="button" className="account-close" onClick={hide} disabled={Boolean(busy)} aria-label="Bağla">✕</button>
            </div>
            <p className="lang-lead">{busy ? "Tərcümə olunur" : "Seçdiyin dil bütün tətbiqə keçir"}</p>
            <input className="lang-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Dil axtar" aria-label="Dil axtar" />
            <div className="lang-list">
              {rows.map((item) => {
                const on = item.code === code;
                return (
                  <button key={item.code} type="button" className={on ? "is-on" : ""} disabled={Boolean(busy)} onClick={() => pick(item.code)}>
                    <span className="lang-badge" data-keep="true">{item.label}</span>
                    <span className="lang-name" data-keep="true">{item.name}</span>
                    {busy === item.code ? <span className="lang-wait">...</span> : null}
                    {on && busy !== item.code ? <span className="account-check">✓</span> : null}
                  </button>
                );
              })}
              {rows.length ? null : <p className="lang-empty">Bu ada uyğun dil yoxdur</p>}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
