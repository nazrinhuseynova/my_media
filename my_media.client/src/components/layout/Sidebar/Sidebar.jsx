import { NavLink } from "react-router-dom";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import { useAppStore } from "../../../stores/useAppStore";
import { useNotificationStore } from "../../../stores/useNotificationStore";
import { useTheme } from "../../../providers/ThemeProvider";
import Icon from "../../ui/Icon";
import Avatar from "../../ui/Avatar";
import { useAccountSheet } from "../../../features/auth/components/AccountSheet";
import { useLanguage } from "../../../features/i18n/useLanguage";

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const unread = useNotificationStore((s) => s.items.filter((n) => !n.read).length);
  const setCreateOpen = useAppStore((s) => s.setCreateOpen);
  const { toggle, theme } = useTheme();
  const showAccounts = useAccountSheet((s) => s.show);
  const showLanguage = useLanguage((s) => s.show);

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand">Pulse</div>
        <p className="brand-tag">Paylaş, izlə, yazış</p>
      </div>
      <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} end>
        <Icon name="home" filled /><span>Ana səhifə</span>
      </NavLink>
      <NavLink to="/search" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <Icon name="search" /><span>Axtarış</span>
      </NavLink>
      <NavLink to="/explore" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <Icon name="explore" /><span>Kəşf et</span>
      </NavLink>
      <NavLink to="/reels" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <Icon name="reels" /><span>Reels</span>
      </NavLink>
      <NavLink to="/direct" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <Icon name="messenger" /><span>Mesajlar</span>
      </NavLink>
      <NavLink to="/notifications" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <span className="nav-icon-wrap">
          <Icon name="heart" />
          {unread ? <span className="notify-dot" /> : null}
        </span>
        <span>Bildirişlər</span>
      </NavLink>
      <button className="nav-item" onClick={() => setCreateOpen(true)}>
        <Icon name="plus" /><span>Yarat</span>
      </button>
      <NavLink to={`/profile/${user?.username}`} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <Avatar src={user?.avatar} alt="" />
        <span>Profil</span>
      </NavLink>
      <NavLink to="/saved" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <Icon name="bookmark" /><span>Saxlanılanlar</span>
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        <Icon name="settings" /><span>Ayarlar</span>
      </NavLink>
      {user?.role === "admin" ? (
        <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          <Icon name="settings" /><span>Admin</span>
        </NavLink>
      ) : null}
      <button className="nav-item nav-more" onClick={toggle} title={theme === "dark" ? "Açıq tema" : "Qaranlıq tema"}>
        <Icon name="theme" /><span>{theme === "dark" ? "Açıq tema" : "Qaranlıq tema"}</span>
      </button>
      <button type="button" className="nav-item" onClick={showLanguage} title="Dil">
        <Icon name="globe" /><span>Dil</span>
      </button>
      <button type="button" className="nav-account" onClick={showAccounts}>
        <Avatar src={user?.avatar} alt="" />
        <span>
          <strong>@{user?.username}</strong>
          <span>Hesablar</span>
        </span>
      </button>
    </aside>
  );
}
