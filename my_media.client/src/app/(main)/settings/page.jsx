import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import LoadingDots from "../../../components/ui/LoadingDots";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import { api } from "../../../services/api";
import { authApi } from "../../../features/auth/services/authApi";
import { uploadFile, mediaSrc } from "../../../utils/upload";
import { useNotificationStore } from "../../../stores/useNotificationStore";
import { isUsername, validatePassword } from "../../../utils/validators";
import Icon from "../../../components/ui/Icon";
import { notify } from "../../../stores/useNoticeStore";
import { useAccountSheet } from "../../../features/auth/components/AccountSheet";
import { rememberAccount } from "../../../features/auth/accountVault";
import { asUtc } from "../../../utils/formatDate";
import { useLanguage } from "../../../features/i18n/useLanguage";
import { LANGUAGES } from "../../../features/i18n/languages";
import { useTheme } from "../../../providers/ThemeProvider";
import { useUiPrefs } from "../../../stores/useUiPrefs";

const NOTIFY_ITEMS = [
  { key: "like", icon: "heart", title: "Bəyənmələr", text: "Paylaşımın bəyəniləndə" },
  { key: "comment", icon: "comment", title: "Şərhlər", text: "Yeni şərh gələndə" },
  { key: "follow", icon: "user", title: "İzləmələr", text: "Yeni izləyici və sorğular" },
  { key: "mention", icon: "share", title: "İşarələr", text: "@ ilə qeyd olunanda" },
  { key: "dm", icon: "messenger", title: "Mesajlar", text: "Yeni birbaşa mesaj" },
];

const LIBRARY = [
  { to: "/liked", icon: "heart", title: "Bəyənilənlər", text: "Reaksiya verdiyin kadrlar" },
  { to: "/saved", icon: "bookmark", title: "Saxlanılanlar", text: "Sonraya qoyduqların" },
  { to: "/archive", icon: "reels", title: "Arxiv", text: "Gizlədilmiş paylaşımlar" },
  { to: "/drafts", icon: "comment", title: "Qaralamalar", text: "Hələ paylaşılmayanlar" },
];

const MENU = [
  { id: "account", icon: "user", title: "Hesabın", text: "Ad, bio, profil şəkli" },
  { id: "privacy", icon: "search", title: "Məxfilik", text: "Kim görür, kim yazır" },
  { id: "notifications", icon: "heart", title: "Bildirişlər", text: "Push və xəbərlər" },
  { id: "security", icon: "user", title: "Təhlükəsizlik", text: "Şifrə və giriş" },
  { id: "sessions", icon: "messenger", title: "Sessiyalar", text: "Açıq cihazlar" },
  { id: "accounts", icon: "user", title: "Hesablar", text: "Keçid, əlavə, çıxış" },
  { id: "appearance", icon: "theme", title: "Görünüş və dil", text: "Tema, dil, hərəkət" },
  { id: "content", icon: "reels", title: "Məzmun və media", text: "Avtomatik oynatma, data" },
  { id: "library", icon: "bookmark", title: "Kolleksiya", text: "Bəyənilən, saxlanan, arxiv" },
  { id: "circle", icon: "user", title: "Yaxın çevrə", text: "Seçilmiş izləyənlər" },
  { id: "danger", icon: "share", title: "Hesabı bağla", text: "Dondur və ya sil", danger: true },
];

const TITLES = {
  menu: "Ayarlar və məxfilik",
  account: "Hesabın",
  privacy: "Məxfilik",
  notifications: "Bildirişlər",
  security: "Təhlükəsizlik",
  sessions: "Sessiyalar",
  accounts: "Hesablar",
  appearance: "Görünüş və dil",
  content: "Məzmun və media",
  library: "Kolleksiya",
  circle: "Yaxın çevrə",
  danger: "Hesabı bağla",
};

function errMsg(err, fallback) {
  return err?.response?.data?.message || fallback;
}

function MenuRow({ icon, title, text, onClick, to, danger }) {
  const inner = (
    <>
      <span className={`settings-menu-ico${danger ? " is-danger" : ""}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="settings-menu-copy">
        <strong>{title}</strong>
        {text ? <em>{text}</em> : null}
      </span>
      <Icon name="next" size={16} />
    </>
  );
  if (to) {
    return <Link className={`settings-menu-row${danger ? " is-danger" : ""}`} to={to}>{inner}</Link>;
  }
  return (
    <button type="button" className={`settings-menu-row${danger ? " is-danger" : ""}`} onClick={onClick}>
      {inner}
    </button>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const showAccounts = useAccountSheet((s) => s.show);
  const showLanguage = useLanguage((s) => s.show);
  const languageCode = useLanguage((s) => s.code);
  const languageName = LANGUAGES.find((item) => item.code === (user?.language || languageCode))?.name || "Azərbaycan dili";
  const { theme, setTheme } = useTheme();
  const prefs = useUiPrefs();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const panel = params.get("panel") || "menu";
  const { settings, loadSettings, saveSettings } = useNotificationStore();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    fullName: user?.fullName || "",
    username: user?.username || "",
    bio: user?.bio || "",
    website: user?.website || "",
    isPrivate: !!user?.isPrivate,
    profileViewHistory: user?.profileViewHistory !== false,
    showActivityStatus: user?.showActivityStatus || "everyone",
    whoCanMessage: user?.whoCanMessage || "everyone",
    whoCanTag: user?.whoCanTag || "everyone",
    whoCanMention: user?.whoCanMention || "everyone",
    readReceipts: user?.readReceipts !== false,
    allowStoryReplies: user?.allowStoryReplies !== false,
    allowStorySharing: user?.allowStorySharing !== false,
    avatar: user?.avatar || "",
    avatarExtension: user?.avatarExtension || "",
  });
  const [pass, setPass] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [circle, setCircle] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [gate, setGate] = useState("");
  const [booting, setBooting] = useState(true);

  function openPanel(id) {
    const next = new URLSearchParams(params);
    if (!id || id === "menu") next.delete("panel");
    else next.set("panel", id);
    setParams(next, { replace: false });
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      loadSettings().catch(() => {}),
      api.get("/api/close-friends").then(setCircle).catch(() => setCircle([])),
      authApi.sessions().then(setSessions).catch(() => setSessions([])),
    ]).finally(() => {
      if (!cancel) setBooting(false);
    });
    return () => { cancel = true; };
  }, [loadSettings]);

  function flash(text, isError) {
    setError(isError ? text : "");
    notify(text, isError);
  }

  function goBack() {
    if (panel !== "menu") {
      openPanel("menu");
      return;
    }
    const idx = window.history.state?.idx;
    if (typeof idx === "number" && idx > 0) navigate(-1);
    else navigate("/");
  }

  function change(e) {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  }

  async function pickAvatar(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const uploaded = await uploadFile(f, "image");
      setForm({ ...form, avatar: uploaded.url, avatarExtension: uploaded.extension });
    } catch (err) {
      flash(errMsg(err, "Şəkil yüklənmədi"), true);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setError("");
    if (!form.fullName.trim() || form.fullName.trim().length < 2) {
      flash("Ad ən az 2 simvol olmalıdır", true);
      return;
    }
    if (!isUsername(form.username.trim())) {
      flash("Username 3-20 simvol, hərf, rəqəm, . və _ ola bilər", true);
      return;
    }
    setBusy("profile");
    try {
      const next = await api.patch("/api/profile", {
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        bio: form.bio,
        website: form.website.trim(),
        isPrivate: form.isPrivate,
        profileViewHistory: form.profileViewHistory,
        showActivityStatus: form.showActivityStatus,
        whoCanMessage: form.whoCanMessage,
        whoCanTag: form.whoCanTag,
        whoCanMention: form.whoCanMention,
        readReceipts: form.readReceipts,
        allowStoryReplies: form.allowStoryReplies,
        allowStorySharing: form.allowStorySharing,
        avatar: form.avatar,
        avatarExtension: form.avatarExtension,
      });
      setUser(next);
      flash("Yadda saxlandı");
    } catch (err) {
      flash(errMsg(err, "Saxlanmadı"), true);
    } finally {
      setBusy("");
    }
  }

  async function changePass(e) {
    e.preventDefault();
    setError("");
    const weak = validatePassword(pass.newPassword);
    if (weak) {
      flash(weak, true);
      return;
    }
    if (pass.newPassword !== pass.confirm) {
      flash("Yeni şifrələr eyni deyil", true);
      return;
    }
    setBusy("pass");
    try {
      const data = await authApi.changePassword({ currentPassword: pass.currentPassword, newPassword: pass.newPassword });
      if (data?.token && data?.refreshToken) rememberAccount(data.user || user, data.token, data.refreshToken);
      setPass({ currentPassword: "", newPassword: "", confirm: "" });
      flash("Şifrə dəyişdirildi");
    } catch (err) {
      flash(errMsg(err, "Şifrə dəyişmədi"), true);
    } finally {
      setBusy("");
    }
  }

  async function toggleNotify(key, value) {
    try {
      await saveSettings({
        like: !!settings.like,
        comment: !!settings.comment,
        follow: !!settings.follow,
        mention: !!settings.mention,
        dm: !!settings.dm,
        [key]: value,
      });
      flash("Bildiriş ayarı yadda saxlandı");
    } catch (err) {
      flash(errMsg(err, "Bildiriş ayarı saxlanmadı"), true);
    }
  }

  async function deactivate() {
    try {
      await authApi.deactivate();
      await logout();
    } catch (err) {
      flash(errMsg(err, "Hesab dondurulmadı"), true);
      setGate("");
    }
  }

  async function removeAccount() {
    try {
      await authApi.removeAccount();
      await logout();
    } catch (err) {
      flash(errMsg(err, "Hesab silinmədi"), true);
      setGate("");
    }
  }

  async function closeSession(id) {
    const res = await authApi.revokeSession(id);
    if (res.current) {
      await logout();
      return;
    }
    setSessions((list) => list.filter((row) => row.id !== id));
    notify("Sessiya bağlandı");
  }

  async function closeOthers() {
    await authApi.revokeOtherSessions();
    setSessions((list) => list.filter((row) => row.current));
    notify("Digər sessiyalar bağlandı");
  }

  function sessionWhen(iso) {
    const date = asUtc(iso);
    if (!date || Number.isNaN(date.getTime())) return "";
    const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${date.getDate()} ${months[date.getMonth()]}, ${hh}:${mm}`;
  }

  const menuItems = MENU.filter((item) => {
    if (item.id === "danger" && user?.role === "admin") return false;
    return true;
  });

  return (
    <div className="page settings-page settings-shell">
      <header className="settings-head">
        <button type="button" className="settings-back" onClick={goBack} aria-label="Geri">
          <Icon name="back" size={18} />
        </button>
        <div>
          <p className="settings-kicker">{panel === "menu" ? "Pulse" : "Ayarlar"}</p>
          <h2>{TITLES[panel] || TITLES.menu}</h2>
        </div>
      </header>
      {error ? <p className="settings-note settings-note-bad">{error}</p> : null}
      {booting ? <LoadingDots className="settings-boot" /> : null}

      {panel === "menu" ? (
        <nav className="settings-menu" aria-label="Ayarlar menyusu">
          {menuItems.map((item) => (
            <MenuRow
              key={item.id}
              icon={item.icon}
              title={item.title}
              text={item.text}
              danger={item.danger}
              onClick={() => openPanel(item.id)}
            />
          ))}
        </nav>
      ) : null}

      {panel === "account" ? (
        <form className="settings-block" onSubmit={saveProfile}>
          <div className="settings-avatar">
            <button type="button" className="settings-avatar-btn" onClick={() => fileRef.current?.click()}>
              <span className="settings-avatar-frame">
                <img src={mediaSrc(form.avatar)} alt="" className="avatar avatar-lg" />
                <span className="settings-avatar-badge"><Icon name="camera" size={14} /></span>
              </span>
              <span className="settings-avatar-copy">
                <strong>{form.fullName || "Profil şəkli"}</strong>
                <span>Şəkli dəyiş</span>
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
          </div>
          <Input name="fullName" label="Ad" value={form.fullName} onChange={change} />
          <Input name="username" label="İstifadəçi adı" value={form.username} onChange={change} />
          <label className="field">
            <span className="settings-label-row"><span>Haqqında</span><span>{form.bio.length}/150</span></span>
            <textarea name="bio" value={form.bio} onChange={change} maxLength={150} />
          </label>
          <Input name="website" label="Sayt" value={form.website} onChange={change} placeholder="https://" />
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="user" size={16} /></span>
            <span>
              <strong>Gizli hesab</strong>
              <span className="muted">İzləmək üçün sorğu lazımdır</span>
            </span>
            <input type="checkbox" name="isPrivate" checked={form.isPrivate} onChange={change} />
          </label>
          <Button disabled={busy === "profile"} type="submit">
            {busy === "profile" ? <LoadingDots /> : "Yadda saxla"}
          </Button>
        </form>
      ) : null}

      {panel === "privacy" ? (
        <form className="settings-block settings-privacy" onSubmit={saveProfile}>
          <p className="muted settings-lead">Instagram / Threads tipli görünürlük və mesaj qaydaları</p>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="search" size={16} /></span>
            <span>
              <strong>Profil baxışları</strong>
              <span className="muted">Son 7 gündə kimin baxdığını gör</span>
            </span>
            <input type="checkbox" name="profileViewHistory" checked={form.profileViewHistory} onChange={change} />
          </label>
          <label className="field">
            <span>Aktivlik statusu (onlayn)</span>
            <select name="showActivityStatus" value={form.showActivityStatus} onChange={change}>
              <option value="everyone">Hər kəs</option>
              <option value="followers">Yalnız izləyənlər</option>
              <option value="nobody">Heç kim</option>
            </select>
          </label>
          <label className="field">
            <span>Kim mesaj yaza bilər</span>
            <select name="whoCanMessage" value={form.whoCanMessage} onChange={change}>
              <option value="everyone">Hər kəs</option>
              <option value="followers">Yalnız izləyənlər</option>
              <option value="nobody">Heç kim</option>
            </select>
          </label>
          <label className="field">
            <span>Kim etiketləyə bilər</span>
            <select name="whoCanTag" value={form.whoCanTag} onChange={change}>
              <option value="everyone">Hər kəs</option>
              <option value="followers">Yalnız izləyənlər</option>
              <option value="nobody">Heç kim</option>
            </select>
          </label>
          <label className="field">
            <span>Kim @qeyd edə bilər</span>
            <select name="whoCanMention" value={form.whoCanMention} onChange={change}>
              <option value="everyone">Hər kəs</option>
              <option value="followers">Yalnız izləyənlər</option>
              <option value="nobody">Heç kim</option>
            </select>
          </label>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="messenger" size={16} /></span>
            <span>
              <strong>Oxundu bildirişləri</strong>
              <span className="muted">Mesajların oxunduğunu göstər</span>
            </span>
            <input type="checkbox" name="readReceipts" checked={form.readReceipts} onChange={change} />
          </label>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="comment" size={16} /></span>
            <span>
              <strong>Hekayə cavabları</strong>
              <span className="muted">Hekayənə cavab yazıla bilsin</span>
            </span>
            <input type="checkbox" name="allowStoryReplies" checked={form.allowStoryReplies} onChange={change} />
          </label>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="share" size={16} /></span>
            <span>
              <strong>Hekayə paylaşımı</strong>
              <span className="muted">Başqaları hekayəni paylaşa bilsin</span>
            </span>
            <input type="checkbox" name="allowStorySharing" checked={form.allowStorySharing} onChange={change} />
          </label>
          <Button disabled={busy === "profile"} type="submit">
            {busy === "profile" ? <LoadingDots /> : "Məxfiliyi saxla"}
          </Button>
        </form>
      ) : null}

      {panel === "notifications" ? (
        <section className="settings-block">
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="heart" size={16} /></span>
            <span>
              <strong>Bildirişləri müvəqqəti dayandır</strong>
              <span className="muted">Bu cihazda xəbərləri sakit saxla</span>
            </span>
            <input
              type="checkbox"
              checked={!!prefs.pauseNotifications}
              onChange={(e) => prefs.setPref("pauseNotifications", e.target.checked)}
            />
          </label>
          <div className="settings-list">
            {NOTIFY_ITEMS.map((item) => (
              <label key={item.key} className="settings-switch">
                <span className="settings-switch-mark"><Icon name={item.icon} size={16} /></span>
                <span>
                  <strong>{item.title}</strong>
                  <span className="muted">{item.text}</span>
                </span>
                <input
                  type="checkbox"
                  checked={!!settings[item.key]}
                  disabled={!!prefs.pauseNotifications}
                  onChange={(e) => toggleNotify(item.key, e.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {panel === "security" ? (
        <form className="settings-block" onSubmit={changePass}>
          <p className="muted settings-lead">Cari şifrəni yaz, sonra yenisini təsdiqlə</p>
          <Input type="password" label="Cari şifrə" value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} />
          <Input type="password" label="Yeni şifrə" value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} />
          <Input type="password" label="Yeni şifrəni təkrarla" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} />
          <Button disabled={busy === "pass"} type="submit">
            {busy === "pass" ? <LoadingDots /> : "Şifrəni yenilə"}
          </Button>
        </form>
      ) : null}

      {panel === "sessions" ? (
        <section className="settings-block">
          <div className="session-list">
            {sessions.length === 0 ? <p className="settings-empty">Aktiv sessiya görünmür.</p> : sessions.map((row) => (
              <div key={row.id} className="session-row">
                <span className="session-mark" aria-hidden="true" />
                <span>
                  <strong>{row.device}</strong>
                  <span className="muted">{row.current ? "Bu cihaz" : `Son istifadə ${sessionWhen(row.lastUsedAt)}`}</span>
                </span>
                {row.current ? <em>Aktiv</em> : (
                  <button type="button" onClick={() => closeSession(row.id)}>Bağla</button>
                )}
              </div>
            ))}
          </div>
          {sessions.some((row) => !row.current) ? (
            <button type="button" className="settings-row-btn session-others" onClick={closeOthers}>
              <span>Digər sessiyaları bağla</span>
              <Icon name="next" size={16} />
            </button>
          ) : null}
        </section>
      ) : null}

      {panel === "accounts" ? (
        <section className="settings-block">
          <div className="settings-actions">
            {user?.role === "admin" ? (
              <p className="muted">Admin bir hesabdır. Buradan başqa hesab əlavə olunmur.</p>
            ) : (
              <>
                <button type="button" className="settings-row-btn" onClick={showAccounts}>
                  <span>Saxlanan hesaba keç</span>
                  <Icon name="next" size={16} />
                </button>
                <button type="button" className="settings-row-btn" onClick={() => navigate("/login?add=1")}>
                  <span>Mövcud hesabı əlavə et</span>
                  <Icon name="next" size={16} />
                </button>
                <button type="button" className="settings-row-btn" onClick={() => navigate("/register?add=1")}>
                  <span>Yeni hesab yarat</span>
                  <Icon name="next" size={16} />
                </button>
              </>
            )}
            <button type="button" className="settings-row-btn" onClick={() => logout()}>
              <span>{user?.role === "admin" ? "Çıxış" : "Bu hesabdan çıx"}</span>
              <Icon name="next" size={16} />
            </button>
            {user?.role === "admin" ? null : (
              <button type="button" className="settings-row-btn" onClick={() => logoutAll()}>
                <span>Bütün hesablardan çıx</span>
                <Icon name="next" size={16} />
              </button>
            )}
          </div>
        </section>
      ) : null}

      {panel === "appearance" ? (
        <section className="settings-block">
          <label className="field">
            <span>Tema</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">Açıq</option>
              <option value="dark">Qaranlıq</option>
            </select>
          </label>
          <button type="button" className="settings-row-btn" onClick={showLanguage}>
            <span>Dil — {languageName}</span>
            <Icon name="next" size={16} />
          </button>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="theme" size={16} /></span>
            <span>
              <strong>Azaldılmış hərəkət</strong>
              <span className="muted">Animasiyaları yumşalt</span>
            </span>
            <input
              type="checkbox"
              checked={!!prefs.reduceMotion}
              onChange={(e) => {
                prefs.setPref("reduceMotion", e.target.checked);
                document.documentElement.dataset.motion = e.target.checked ? "reduce" : "normal";
              }}
            />
          </label>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="theme" size={16} /></span>
            <span>
              <strong>Yüksək kontrast</strong>
              <span className="muted">Mətn və sərhədləri daha aydın göstər</span>
            </span>
            <input
              type="checkbox"
              checked={!!prefs.highContrast}
              onChange={(e) => {
                prefs.setPref("highContrast", e.target.checked);
                document.documentElement.dataset.contrast = e.target.checked ? "high" : "normal";
              }}
            />
          </label>
        </section>
      ) : null}

      {panel === "content" ? (
        <section className="settings-block">
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="reels" size={16} /></span>
            <span>
              <strong>Videoları avtomatik oynat</strong>
              <span className="muted">Lent və axtarışda video özü işə düşsün</span>
            </span>
            <input
              type="checkbox"
              checked={!!prefs.autoplayVideos}
              onChange={(e) => prefs.setPref("autoplayVideos", e.target.checked)}
            />
          </label>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="reels" size={16} /></span>
            <span>
              <strong>Data qənaəti</strong>
              <span className="muted">Daha yüngül media və daha az ön yükləmə</span>
            </span>
            <input
              type="checkbox"
              checked={!!prefs.dataSaver}
              onChange={(e) => prefs.setPref("dataSaver", e.target.checked)}
            />
          </label>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="heart" size={16} /></span>
            <span>
              <strong>Bəyənmə sayını gizlət</strong>
              <span className="muted">Öz lentində sayları göstərmə (lokal)</span>
            </span>
            <input
              type="checkbox"
              checked={!!prefs.hideLikeCounts}
              onChange={(e) => prefs.setPref("hideLikeCounts", e.target.checked)}
            />
          </label>
          <label className="settings-switch">
            <span className="settings-switch-mark"><Icon name="bookmark" size={16} /></span>
            <span>
              <strong>Orijinal keyfiyyətdə yüklə</strong>
              <span className="muted">Yükləmələrdə yüksək keyfiyyət</span>
            </span>
            <input
              type="checkbox"
              checked={!!prefs.downloadOriginal}
              onChange={(e) => prefs.setPref("downloadOriginal", e.target.checked)}
            />
          </label>
        </section>
      ) : null}

      {panel === "library" ? (
        <section className="settings-block">
          <div className="settings-tabs">
            {LIBRARY.map((item) => (
              <Link key={item.to} className="settings-tab-link" to={item.to}>
                <span className="settings-tab-icon"><Icon name={item.icon} size={18} /></span>
                <span>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </span>
                <Icon name="next" size={16} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {panel === "circle" ? (
        <section className="settings-block">
          {circle.length === 0 ? (
            <p className="settings-empty">Siyahı boşdur. Profildə “Yaxın çevrə” düyməsi ilə əlavə et.</p>
          ) : (
            <div className="settings-circle">
              {circle.map((person) => (
                <Link key={person.id} className="settings-person" to={`/profile/${person.username}`}>
                  <img src={mediaSrc(person.avatar)} alt="" className="avatar" />
                  <span>@{person.username}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {panel === "danger" && user?.role !== "admin" ? (
        <section className="settings-block settings-danger">
          <p className="muted settings-lead">Dondurma girişi bağlayır, məlumat qalır. Silmə adı və profili həmişəlik götürür.</p>
          <div className="settings-actions">
            {gate === "freeze" ? (
              <div className="settings-confirm">
                <p>Bu hesab dondurulsun? Bu adla bir daha daxil olmaq olmayacaq.</p>
                <button type="button" onClick={() => setGate("")}>Qalsın</button>
                <button type="button" className="is-danger" onClick={deactivate}>Dondur</button>
              </div>
            ) : (
              <button type="button" className="settings-row-btn" onClick={() => setGate("freeze")}>
                <span>Hesabı dondur</span>
                <Icon name="next" size={16} />
              </button>
            )}
            {gate === "delete" ? (
              <div className="settings-confirm">
                <p>Hesab həmişəlik silinsin? Bu addım geri qayıtmır.</p>
                <button type="button" onClick={() => setGate("")}>Qalsın</button>
                <button type="button" className="is-danger" onClick={removeAccount}>Silinsin</button>
              </div>
            ) : (
              <button type="button" className="settings-row-btn settings-row-danger" onClick={() => setGate("delete")}>
                <span>Hesabı sil</span>
                <Icon name="next" size={16} />
              </button>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
