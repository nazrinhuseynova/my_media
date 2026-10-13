import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { validateRegister } from "../../../utils/validators";
import { authApi, authMessage } from "../../../features/auth/services/authApi";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import SocialAuthSheet from "../../../features/auth/components/SocialAuthSheet";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const adding = params.get("add") === "1";
  const social = useAuthStore((s) => s.social);
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    username: "",
    contact: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [socialKind, setSocialKind] = useState("");

  function change(e) {
    setValues({ ...values, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    const next = validateRegister(values);
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError("");
    try {
      const payload = {
        fullName: `${values.firstName.trim()} ${values.lastName.trim()}`,
        username: values.username.trim(),
        contact: values.contact.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
      };
      const data = await authApi.register(payload);
      navigate("/otp", { state: { userId: data.userId, previewCode: data.previewCode, mode: "register" } });
    } catch (err) {
      setFormError(authMessage(err, "Qeydiyyat alınmadı"));
    } finally {
      setBusy(false);
    }
  }

  async function provider(payload) {
    setBusy(true);
    try {
      await social(socialKind, { ...payload, fullName: payload.fullName || `${values.firstName} ${values.lastName}`.trim() });
      setSocialKind("");
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap auth-wrap-register">
      <div className="card auth-card">
        <h1 className="brand">Pulse</h1>
        <p className="muted auth-lead">Email və ya telefon ilə qeydiyyat</p>
        <form autoComplete="off" onSubmit={submit}>
          <input tabIndex={-1} aria-hidden="true" autoComplete="username" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
          <input type="password" tabIndex={-1} aria-hidden="true" autoComplete="current-password" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
          <div className="auth-row">
            <Input name="firstName" label="Ad" value={values.firstName} onChange={change} error={errors.firstName} autoComplete="off" />
            <Input name="lastName" label="Soyad" value={values.lastName} onChange={change} error={errors.lastName} autoComplete="off" />
          </div>
          <Input name="username" label="Username" value={values.username} onChange={change} error={errors.username} autoComplete="off" />
          <Input name="contact" label="Email və ya telefon" value={values.contact} onChange={change} error={errors.contact} autoComplete="off" />
          <Input name="password" type="password" label="Şifrə" value={values.password} onChange={change} error={errors.password} autoComplete="off" />
          <Input name="confirmPassword" type="password" label="Şifrəni təkrarla" value={values.confirmPassword} onChange={change} error={errors.confirmPassword} autoComplete="off" />
          {formError ? <p className="error-text">{formError}</p> : null}
          <Button disabled={busy} type="submit">{busy ? "Gözləyin..." : "Qeydiyyat"}</Button>
        </form>
        <div className="auth-or"><span>VE YA</span></div>
        <div className="auth-providers">
          <Button className="auth-provider" variant="ghost" type="button" onClick={() => { setFormError(""); setSocialKind("google"); }}>
            Google ilə qeydiyyat
          </Button>
          <Button className="auth-provider" variant="ghost" type="button" onClick={() => { setFormError(""); setSocialKind("apple"); }}>
            Apple ilə qeydiyyat
          </Button>
        </div>
        <p className="muted auth-switch-inline">Hesabın var? <Link to={adding ? "/login?add=1" : "/login"}>Giriş</Link></p>
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
