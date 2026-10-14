import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import { useAppStore } from "../../../stores/useAppStore";
import { useTheme } from "../../../providers/ThemeProvider";
import Icon from "../../ui/Icon";
import Avatar from "../../ui/Avatar";
import { useAccountSheet } from "../../../features/auth/components/AccountSheet";
import { useLanguage } from "../../../features/i18n/useLanguage";

export default function BottomNav() {
  const user = useAuthStore((s) => s.user);
  const setCreateOpen = useAppStore((s) => s.setCreateOpen);
  const { toggle, theme } = useTheme();
  const [more, setMore] = useState(false);
  const showAccounts = useAccountSheet((s) => s.show);
  const showLanguage = useLanguage((s) => s.show);

  function close() {
    setMore(false);
  }

  return (
    <>
      {more ? <button type="button" className="more-back" aria-label="Bağla" onClick={close} /> : null}
      {more ? (
        <div className="more-sheet">
          <NavLink to="/explore" onClick={close}><Icon name="explore" size={20} /> Kəşf et</NavLink>
          <NavLink to="/direct" onClick={close}><Icon name="messenger" size={20} /> Mesajlar</NavLink>
          <NavLink to="/notifications" onClick={close}><Icon name="heart" size={20} /> Bildirişlər</NavLink>
          <NavLink to="/saved" onClick={close}><Icon name="bookmark" size={20} /> Saxlanılanlar</NavLink>
          <NavLink to="/settings" onClick={close}><Icon name="settings" size={20} /> Ayarlar</NavLink>
          <button type="button" onClick={() => { close(); showAccounts(); }}><Icon name="user" size={20} /> Hesablar</button>
          <button type="button" onClick={() => { close(); showLanguage(); }}><Icon name="globe" size={20} /> Dil</button>
          {user?.role === "admin" ? <NavLink to="/admin" onClick={close}><Icon name="settings" size={20} /> Admin</NavLink> : null}
          <button type="button" onClick={toggle}>
            <Icon name="theme" size={20} />
            {theme === "dark" ? "Açıq tema" : "Qaranlıq tema"}
          </button>
        </div>
      ) : null}
      <nav className="bottom-nav">
        <NavLink to="/" end aria-label="Ana səhifə"><Icon name="home" /></NavLink>
        <NavLink to="/search" aria-label="Axtarış"><Icon name="search" /></NavLink>
        <button type="button" onClick={() => setCreateOpen(true)} aria-label="Yarat"><Icon name="plus" /></button>
        <NavLink to="/reels" aria-label="Reels"><Icon name="reels" /></NavLink>
        <NavLink to={`/profile/${user?.username}`} aria-label="Profil"><Avatar src={user?.avatar} /></NavLink>
        <button type="button" className={more ? "is-on" : ""} onClick={() => setMore((open) => !open)} aria-label="Daha çox">
          <Icon name="more" />
        </button>
      </nav>
    </>
  );
}
