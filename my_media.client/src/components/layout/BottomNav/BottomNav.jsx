import { useEffect, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import { useAppStore } from "../../../stores/useAppStore";
import { useTheme } from "../../../providers/ThemeProvider";
import Icon from "../../ui/Icon";
import Avatar from "../../ui/Avatar";
import { useAccountSheet } from "../../../features/auth/components/AccountSheet";
import { useLanguage } from "../../../features/i18n/useLanguage";
import { TOUR_SHEET } from "../../../features/tour/tourFlag";

export default function BottomNav() {
  const user = useAuthStore((s) => s.user);
  const setCreateOpen = useAppStore((s) => s.setCreateOpen);
  const { toggle, theme } = useTheme();
  const [more, setMore] = useState(false);
  const showAccounts = useAccountSheet((s) => s.show);
  const showLanguage = useLanguage((s) => s.show);
  const [params] = useSearchParams();
  const section = params.get("section") || "overview";
  const admin = user?.role === "admin";

  function close() {
    setMore(false);
  }

  useEffect(() => {
    function onSheet(event) {
      setMore(Boolean(event.detail));
    }
    window.addEventListener(TOUR_SHEET, onSheet);
    return () => window.removeEventListener(TOUR_SHEET, onSheet);
  }, []);

  return (
    <>
      {more ? <button type="button" className="more-back" aria-label="Bağla" onClick={close} /> : null}
      {more ? (
        <div className="more-sheet">
          {admin ? null : <NavLink to="/explore" data-tour="explore" onClick={close}><Icon name="explore" size={20} /> Kəşf et</NavLink>}
          {admin ? null : <NavLink to="/direct" data-tour="direct" onClick={close}><Icon name="messenger" size={20} /> Mesajlar</NavLink>}
          {admin ? null : <NavLink to="/notifications" data-tour="notifications" onClick={close}><Icon name="heart" size={20} /> Bildirişlər</NavLink>}
          {admin ? null : <NavLink to="/saved" data-tour="saved" onClick={close}><Icon name="bookmark" size={20} /> Saxlanılanlar</NavLink>}
          {admin ? <Link to="/admin?section=stories" aria-current={section === "stories" ? "page" : undefined} onClick={close}><Icon name="camera" size={20} /> Hekayələr</Link> : null}
          {admin ? <Link to="/admin?section=lives" aria-current={section === "lives" ? "page" : undefined} onClick={close}><Icon name="mic" size={20} /> Canlı</Link> : null}
          {admin ? <Link to="/admin?section=reports" aria-current={section === "reports" ? "page" : undefined} onClick={close}><Icon name="heart" size={20} /> Şikayətlər</Link> : null}
          <NavLink to="/settings" data-tour="settings" onClick={close}><Icon name="settings" size={20} /> Ayarlar</NavLink>
          {admin ? null : <button type="button" data-tour="accounts" onClick={() => { close(); showAccounts(); }}><Icon name="user" size={20} /> Hesablar</button>}
          <button type="button" data-tour="language" onClick={() => { close(); showLanguage(); }}><Icon name="globe" size={20} /> Dil</button>
          <button type="button" data-tour="theme" onClick={toggle}>
            <Icon name="theme" size={20} />
            {theme === "dark" ? "Açıq tema" : "Qaranlıq tema"}
          </button>
        </div>
      ) : null}
      <nav className="bottom-nav">
        {admin ? (
          <>
            <Link to="/admin" aria-label="İcmal" aria-current={section === "overview" ? "page" : undefined} className={section === "overview" ? "active" : ""}><Icon name="home" /></Link>
            <Link to="/admin?section=users" aria-label="İstifadəçilər" aria-current={section === "users" ? "page" : undefined} className={section === "users" ? "active" : ""}><Icon name="search" /></Link>
            <Link to="/admin?section=posts" aria-label="Postlar" aria-current={section === "posts" ? "page" : undefined} className={section === "posts" ? "active" : ""}><Icon name="plus" /></Link>
            <Link to="/admin?section=reels" aria-label="Reels" aria-current={section === "reels" ? "page" : undefined} className={section === "reels" ? "active" : ""}><Icon name="reels" /></Link>
            <Link to="/admin?section=comments" aria-label="Şərhlər" aria-current={section === "comments" ? "page" : undefined} className={section === "comments" ? "active" : ""}><Icon name="comment" /></Link>
          </>
        ) : (
          <>
            <NavLink to="/" end data-tour="home" aria-label="Ana səhifə"><Icon name="home" /></NavLink>
            <NavLink to="/search" data-tour="search" aria-label="Axtarış"><Icon name="search" /></NavLink>
            <button type="button" data-tour="create" onClick={() => setCreateOpen(true)} aria-label="Yarat"><Icon name="plus" /></button>
            <NavLink to="/reels" data-tour="reels" aria-label="Reels"><Icon name="reels" /></NavLink>
            <NavLink to={`/profile/${user?.username}`} data-tour="profile" aria-label="Profil"><Avatar src={user?.avatar} /></NavLink>
          </>
        )}
        <button type="button" className={more ? "is-on" : ""} onClick={() => setMore((open) => !open)} aria-label="Daha çox">
          <Icon name="more" />
        </button>
      </nav>
    </>
  );
}
