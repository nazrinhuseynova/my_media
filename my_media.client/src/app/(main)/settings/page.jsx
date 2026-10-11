import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import { api } from "../../../services/api";
import { authApi } from "../../../features/auth/services/authApi";
import { uploadFile, API_ORIGIN } from "../../../utils/upload";
import { useNotificationStore } from "../../../stores/useNotificationStore";
import { isUsername, validatePassword } from "../../../utils/validators";
import Icon from "../../../components/ui/Icon";

const NOTIFY_ITEMS = [
  { key: "like", title: "Bəyənmələr", text: "Kiminsə paylaşımını bəyəndiyini göstər" },
  { key: "comment", title: "Şərhlər", text: "Yeni şərh gələndə xəbər ver" },
  { key: "follow", title: "İzləmələr", text: "Yeni izləyici və sorğular" },
  { key: "mention", title: "İşarələr", text: "Səni @ ilə qeyd edəndə" },
  { key: "dm", title: "Mesajlar", text: "Yeni birbaşa mesaj" },
];

function mediaSrc(url) {
  if (!url) return "";
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

function errMsg(err, fallback) {
  return err?.response?.data?.message || fallback;
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { settings, loadSettings, saveSettings } = useNotificationStore();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    fullName: user?.fullName || "",
    username: user?.username || "",
    bio: user?.bio || "",
    website: user?.website || "",
    isPrivate: !!user?.isPrivate,
    avatar: user?.avatar || "",
    avatarExtension: user?.avatarExtension || "",
  });
  const [pass, setPass] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [circle, setCircle] = useState([]);

  useEffect(() => {
    loadSettings().catch(() => {});
    api.get("/api/close-friends").then(setCircle).catch(() => setCircle([]));
  }, [loadSettings]);

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
      setError(errMsg(err, "Şəkil yüklənmədi"));
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setError("");
    if (!form.fullName.trim() || form.fullName.trim().length < 2) {
      setError("Ad ən az 2 simvol olmalıdır");
      return;
    }
    if (!isUsername(form.username.trim())) {
      setError("Username 3-20 simvol, hərf, rəqəm, . və _ ola bilər");
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
        avatar: form.avatar,
        avatarExtension: form.avatarExtension,
      });
      setUser(next);
      setMsg("Profil yadda saxlandı");
    } catch (err) {
      setError(errMsg(err, "Profil saxlanmadı"));
    } finally {
      setBusy("");
    }
  }

  async function changePass(e) {
    e.preventDefault();
    setError("");
    const weak = validatePassword(pass.newPassword);
    if (weak) {
      setError(weak);
      return;
    }
    if (pass.newPassword !== pass.confirm) {
      setError("Yeni şifrələr eyni deyil");
      return;
    }
    setBusy("pass");
    try {
      await authApi.changePassword({ currentPassword: pass.currentPassword, newPassword: pass.newPassword });
      setPass({ currentPassword: "", newPassword: "", confirm: "" });
      setMsg("Şifrə dəyişdirildi");
    } catch (err) {
      setError(errMsg(err, "Şifrə dəyişmədi"));
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
    } catch (err) {
      setError(errMsg(err, "Bildiriş ayarı saxlanmadı"));
    }
  }

  async function deactivate() {
    if (!window.confirm("Hesab deaktiv olsun? Yenidən daxil ola bilməyəcəksən.")) return;
    await authApi.deactivate();
    logout();
    navigate("/login");
  }

  async function removeAccount() {
    if (!window.confirm("Hesab həmişəlik bağlansın? Bu addım geri qayıtmır.")) return;
    await authApi.removeAccount();
    logout();
    navigate("/register");
  }

  return (
    <div className="page settings-page">
      <header className="settings-head">
        <button type="button" className="reels-back" onClick={goBack}>
          <Icon name="back" size={22} />
          <span>Geri</span>
        </button>
        <div>
          <h2>Ayarlar</h2>
          <p className="muted">Profil, təhlükəsizlik, arxiv və bildirişlər</p>
        </div>
      </header>
      {msg ? <p className="success-text">{msg}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <form className="settings-block" onSubmit={saveProfile}>
        <h3>Profil</h3>
        <p className="muted">Adın və görünüşün başqalarına belə görünəcək</p>
        <div className="settings-avatar">
          <button type="button" className="settings-avatar-btn" onClick={() => fileRef.current?.click()}>
            <img src={mediaSrc(form.avatar)} alt="" className="avatar avatar-lg" />
            <span>Şəkli dəyiş</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
        </div>
        <Input name="fullName" label="Ad" value={form.fullName} onChange={change} />
        <Input name="username" label="İstifadəçi adı" value={form.username} onChange={change} />
        <label className="field">Haqqında
          <textarea name="bio" value={form.bio} onChange={change} maxLength={150} />
        </label>
        <Input name="website" label="Sayt" value={form.website} onChange={change} placeholder="https://" />
        <label className="settings-switch">
          <span>
            <strong>Gizli hesab</strong>
            <span className="muted">İzləmək üçün sorğu lazımdır</span>
          </span>
          <input type="checkbox" name="isPrivate" checked={form.isPrivate} onChange={change} />
        </label>
        <Button disabled={busy === "profile"} type="submit">Yadda saxla</Button>
      </form>

      <form className="settings-block" onSubmit={changePass}>
        <h3>Təhlükəsizlik</h3>
        <p className="muted">Cari şifrəni yaz, sonra yenisini təsdiqlə</p>
        <Input type="password" label="Cari şifrə" value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} />
        <Input type="password" label="Yeni şifrə" value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} />
        <Input type="password" label="Yeni şifrəni təkrarla" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} />
        <Button disabled={busy === "pass"} type="submit">Şifrəni yenilə</Button>
      </form>

      <section className="settings-block">
        <h3>Bildirişlər</h3>
        <p className="muted">Hansı xəbərlərin gəlməsini sən seçirsən</p>
        {NOTIFY_ITEMS.map((item) => (
          <label key={item.key} className="settings-switch">
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
      </section>

      <section className="settings-block">
        <h3>Kolleksiya</h3>
        <p className="muted">Bəyəndiyin və saxladığın kadrlar ayrı səhifədə açılır</p>
        <div className="settings-tabs">
          <Link className="settings-tab-link" to="/liked">Bəyənilənlər</Link>
          <Link className="settings-tab-link" to="/saved">Saxlanılanlar</Link>
          <Link className="settings-tab-link" to="/archive">Arxiv</Link>
          <Link className="settings-tab-link" to="/drafts">Qaralamalar</Link>
        </div>
      </section>

      <section className="settings-block">
        <h3>Yaxın çevrə</h3>
        <p className="muted">Yalnız bu adamlara görünən hekayələr</p>
        {circle.length === 0 ? <p className="muted">Siyahı boşdur. Profildə “Yaxın çevrə” düyməsi ilə əlavə et.</p> : (
          <div className="highlight-row">
            {circle.map((person) => (
              <Link key={person.id} className="highlight-chip" to={`/profile/${person.username}`}>@{person.username}</Link>
            ))}
          </div>
        )}
      </section>

      <section className="settings-block settings-danger">
        <h3>Hesab</h3>
        <p className="muted">Çıxış müvəqqətidir, silmə isə hesabı bağlayır</p>
        <div className="settings-actions">
          <Button variant="ghost" type="button" onClick={() => { logout(); navigate("/login"); }}>Çıxış</Button>
          <Button variant="ghost" type="button" onClick={deactivate}>Hesabı dondur</Button>
          <Button variant="danger" type="button" onClick={removeAccount}>Hesabı sil</Button>
        </div>
      </section>
    </div>
  );
}
