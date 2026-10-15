import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { guestMessage } from "../auth/services/authApi";
import { useAuthStore } from "../auth/store/useAuthStore";
import { chooseLanguage } from "../i18n/engine";
import { LANGUAGES } from "../i18n/languages";

export default function WelcomePage() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="loading-dots" role="status" aria-label="Yüklənir">
          <span /><span /><span />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.language) return <Navigate to={user.role === "admin" ? "/admin" : "/"} replace />;

  const needle = query.trim().toLocaleLowerCase();
  const rows = LANGUAGES.filter((item) => !needle || item.name.toLocaleLowerCase().includes(needle) || item.label.toLocaleLowerCase().includes(needle));

  async function pick(code) {
    setBusy(code);
    setError("");
    try {
      const saved = await api.patch("/api/profile/language", { language: code });
      setUser(saved);
      await chooseLanguage(code);
      navigate(saved.role === "admin" ? "/admin" : "/", { replace: true });
    } catch (err) {
      setError(guestMessage(err, "Couldn't save the language"));
      setBusy("");
    }
  }

  return (
    <div className="welcome-lang" data-keep>
      <div className="intro-glow" />
      <p className="welcome-mark" data-keep>Pulse</p>
      <p className="welcome-ask">Choose your language</p>
      <div className="welcome-panel">
        <input className="lang-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search languages" aria-label="Search languages" />
        <div className="lang-list">
          {rows.map((item) => (
            <button key={item.code} type="button" disabled={Boolean(busy)} onClick={() => pick(item.code)}>
              <span className="lang-badge" data-keep>{item.label}</span>
              <span className="lang-name" data-keep>{item.name}</span>
              {busy === item.code ? <span className="lang-wait">...</span> : null}
            </button>
          ))}
          {rows.length ? null : <p className="lang-empty">No language matches that name</p>}
        </div>
        {error ? <p className="welcome-error">{error}</p> : null}
      </div>
    </div>
  );
}
