import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
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

const NOTIFY_ITEMS = [
  { key: "like", icon: "heart", title: "Bəyənmələr", text: "Kiminsə paylaşımını bəyəndiyini göstər" },
  { key: "comment", icon: "comment", title: "Şərhlər", text: "Yeni şərh gələndə xəbər ver" },
  { key: "follow", icon: "user", title: "İzləmələr", text: "Yeni izləyici və sorğular" },
  { key: "mention", icon: "share", title: "İşarələr", text: "Səni @ ilə qeyd edəndə" },
  { key: "dm", icon: "messenger", title: "Mesajlar", text: "Yeni birbaşa mesaj" },
];

const LIBRARY = [
  { to: "/liked", icon: "heart", title: "Bəyənilənlər", text: "Reaksiya verdiyin kadrlar" },
  { to: "/saved", icon: "bookmark", title: "Saxlanılanlar", text: "Sonraya qoyduqların" },
  { to: "/archive", icon: "reels", title: "Arxiv", text: "Gizlədilmiş paylaşımlar" },
  { to: "/drafts", icon: "comment", title: "Qaralamalar", text: "Hələ paylaşılmayanlar" },
];

function errMsg(err, fallback) {
  return err?.response?.data?.message || fallback;
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const showAccounts = useAccountSheet((s) => s.show);
  const navigate = useNavigate();
  const { settings, loadSettings, saveSettings } = useNotificationStore();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    fullName: user?.fullName || "",
    username: user?.username || "",
    bio: user?.bio || "",
    website: user?.website || "",
    isPrivate: !!user?.isPrivate,
    profileViewHistory: user?.profileViewHistory !== false,
    avatar: user?.avatar || "",
    avatarExtension: user?.avatarExtension || "",
  });
  const [pass, setPass] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [circle, setCircle] = useState([]);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    loadSettings().catch(() => {});
    api.get("/api/close-friends").then(setCircle).catch(() => setCircle([]));
    authApi.sessions().then(setSessions).catch(() => setSessions([]));
  }, [loadSettings]);

  function flash(text, isError) {
    setError(isError ? text : "");
    notify(text, isError);
  }

  function goBack() {
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
        avatar: form.avatar,
        avatarExtension: form.avatarExtension,
      });
      setUser(next);
      flash("Profil yadda saxlandı");
    } catch (err) {
      flash(errMsg(err, "Profil saxlanmadı"), true);
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
    if (!window.confirm("Hesab deaktiv olsun? Yenidən daxil ola bilməyəcəksən.")) return;
    await authApi.deactivate();
    await logout();
  }

  async function removeAccount() {
    if (!window.confirm("Hesab həmişəlik bağlansın? Bu addım geri qayıtmır.")) return;
    await authApi.removeAccount();
    await logout();
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

  return (
    <div className="page settings-page">
      <header className="settings-head">
        <button type="button" className="settings-back" onClick={goBack} aria-label="Geri">
          <Icon name="back" size={18} />
        </button>
        <div>
          <p className="settings-kicker">Hesab</p>
          <h2>Ayarlar</h2>
          <p className="muted">Profil, təhlükəsizlik, arxiv və bildirişlər</p>
        </div>
      </header>
      {error ? <p className="settings-note settings-note-bad">{error}</p> : null}

      <form className="settings-block" onSubmit={saveProfile}>
        <div className="settings-block-head">
          <h3>Profil</h3>
          <p className="muted">Adın və görünüşün başqalarına belə görünəcək</p>
        </div>
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
        <label className="settings-switch">
          <span className="settings-switch-mark"><Icon name="search" size={16} /></span>
          <span>
            <strong>Profil baxışları</strong>
            <span className="muted">Açıq olanda son 7 gündə kimin baxdığını görürsən və sənin baxışın da görünür. Bağlı olanda heç biri yazılmır.</span>
          </span>
          <input type="checkbox" name="profileViewHistory" checked={form.profileViewHistory} onChange={change} />
        </label>
        <Button disabled={busy === "profile"} type="submit">Yadda saxla</Button>
      </form>

      <form className="settings-block" onSubmit={changePass}>
        <div className="settings-block-head">
          <h3>Təhlükəsizlik</h3>
          <p className="muted">Cari şifrəni yaz, sonra yenisini təsdiqlə</p>
        </div>
        <Input type="password" label="Cari şifrə" value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} />
        <Input type="password" label="Yeni şifrə" value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} />
        <Input type="password" label="Yeni şifrəni təkrarla" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} />
        <Button disabled={busy === "pass"} type="submit">Şifrəni yenilə</Button>
      </form>

      <section className="settings-block">
        <div className="settings-block-head">
          <h3>Bildirişlər</h3>
          <p className="muted">Hansı xəbərlərin gəlməsini sən seçirsən</p>
        </div>
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
                onChange={(e) => toggleNotify(item.key, e.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-block-head">
          <h3>Kolleksiya</h3>
          <p className="muted">Bəyəndiyin və saxladığın kadrlar ayrı səhifədə açılır</p>
        </div>
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

      <section className="settings-block">
        <div className="settings-block-head">
          <h3>Yaxın çevrə</h3>
          <p className="muted">Yalnız bu adamlara görünən hekayələr</p>
        </div>
        {circle.length === 0 ? <p className="settings-empty">Siyahı boşdur. Profildə “Yaxın çevrə” düyməsi ilə əlavə et.</p> : (
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

      <section className="settings-block">
        <div className="settings-block-head">
          <h3>Hesablar</h3>
          <p className="muted">Bu cihazda bir neçə hesab saxla və aralarında keç</p>
        </div>
        <div className="settings-actions">
          <button type="button" className="settings-row-btn" onClick={showAccounts}>
            <span>Hesab əlavə et və ya keç</span>
            <Icon name="next" size={16} />
          </button>
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-block-head">
          <h3>Sessiyalar</h3>
          <p className="muted">Bu hesabın açıq olduğu cihazlar. Başqa cihazı buradan bağla</p>
        </div>
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

      <section className="settings-block settings-danger">
        <div className="settings-block-head">
          <h3>Hesab</h3>
          <p className="muted">Çıxış yalnız bu hesabı bağlayır. Başqa hesab qalıbsa ona keçilir</p>
        </div>
        <div className="settings-actions">
          <button type="button" className="settings-row-btn" onClick={() => logout()}>
            <span>Çıxış</span>
            <Icon name="next" size={16} />
          </button>
          <button type="button" className="settings-row-btn" onClick={deactivate}>
            <span>Hesabı dondur</span>
            <Icon name="next" size={16} />
          </button>
          <button type="button" className="settings-row-btn settings-row-danger" onClick={removeAccount}>
            <span>Hesabı sil</span>
            <Icon name="next" size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
