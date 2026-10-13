import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import Avatar from "../../../components/ui/Avatar";
import { validateLogin } from "../../../utils/validators";
import { authMessage } from "../../../features/auth/services/authApi";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import SocialAuthSheet from "../../../features/auth/components/SocialAuthSheet";
import { readAccounts } from "../../../features/auth/accountVault";

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const adding = params.get("add") === "1";
  const login = useAuthStore((s) => s.login);
  const social = useAuthStore((s) => s.social);
  const switchTo = useAuthStore((s) => s.switchTo);
  const [values, setValues] = useState({ contact: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [socialKind, setSocialKind] = useState("");
  const [saved, setSaved] = useState(() => readAccounts());

  function change(e) {
    setValues({ ...values, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    const next = validateLogin(values);
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError("");
    try {
      await login(values);
      window.location.assign("/");
    } catch (err) {
      const data = err.response?.data;
      if (data?.needsOtp && data.userId) {
        navigate("/otp", { state: { userId: data.userId, previewCode: data.previewCode, mode: "register" } });
        return;
      }
      setFormError(authMessage(err, "Giriş alınmadı"));
    } finally {
      setBusy(false);
    }
  }

  async function provider(payload) {
    setBusy(true);
    try {
      await social(socialKind, payload);
      setSocialKind("");
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  }

  async function resume(account) {
    setBusy(true);
    setFormError("");
    try {
      await switchTo(account);
    } catch {
      setSaved(readAccounts());
      setFormError("Bu hesabın sessiyası bitib. Şifrə ilə yenidən daxil ol");
      setValues({ contact: account.username || "", password: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        {adding ? (
          <button type="button" className="auth-back" onClick={() => navigate(-1)}>Geri</button>
        ) : null}
        <h1 className="brand">Pulse</h1>
        <p className="muted auth-lead">{adding ? "Başqa hesabla daxil ol. İndiki hesab bu cihazda qalır." : "Hesabına daxil ol"}</p>
        {!adding && saved.length ? (
          <div className="saved-accounts">
            {saved.map((account) => (
              <button key={account.id} type="button" className="saved-account" onClick={() => resume(account)} disabled={busy}>
                <Avatar src={account.avatar} alt={account.username} />
                <span>
                  <strong>{account.fullName || account.username}</strong>
                  <span>@{account.username}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <form autoComplete="off" onSubmit={submit}>
          <input tabIndex={-1} aria-hidden="true" autoComplete="username" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
          <input type="password" tabIndex={-1} aria-hidden="true" autoComplete="current-password" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
          <Input name="contact" placeholder="Telefon, email və ya username" value={values.contact} onChange={change} error={errors.contact} autoComplete="off" autoCorrect="off" spellCheck={false} />
          <Input name="password" type="password" placeholder="Şifrə" value={values.password} onChange={change} error={errors.password} autoComplete="off" />
          {formError ? <p className="error-text">{formError}</p> : null}
          <Button disabled={busy} type="submit">{busy ? "Gözləyin..." : "Daxil ol"}</Button>
        </form>
        <div className="auth-or"><span>VE YA</span></div>
        <div className="auth-providers">
          <Button className="auth-provider" variant="ghost" type="button" onClick={() => { setFormError(""); setSocialKind("google"); }}>
            Google ilə daxil ol
          </Button>
          <Button className="auth-provider" variant="ghost" type="button" onClick={() => { setFormError(""); setSocialKind("apple"); }}>
            Apple ilə daxil ol
          </Button>
          <Link className="auth-forgot" to="/forgot-password">Şifrəni unutmusan?</Link>
        </div>
      </div>
      <div className="card auth-card auth-switch">
        <p>Hesabın yoxdur? <Link to={adding ? "/register?add=1" : "/register"}>Qeydiyyatdan keç</Link></p>
      </div>
      <SocialAuthSheet
        kind={socialKind}
        open={Boolean(socialKind)}
        onClose={() => setSocialKind("")}
        onSubmit={provider}
        busy={busy}
      />
    </div>
  );
}
