import { useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import Avatar from "../../../components/ui/Avatar";
import { validateLoginEn } from "../../../utils/validators";
import { guestMessage } from "../../../features/auth/services/authApi";
import ProviderButtons from "../../../features/auth/components/ProviderButtons";
import { readAccounts, revokeRefresh } from "../../../features/auth/accountVault";
import { openHome, useAuthStore } from "../../../features/auth/store/useAuthStore";

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
  const [saved, setSaved] = useState(() => readAccounts());

  function change(e) {
    setValues({ ...values, [e.target.name]: e.target.value });
    if (formError) setFormError("");
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: "" });
  }

  async function submit(e) {
    e.preventDefault();
    const next = validateLoginEn(values);
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError("");
    const previousToken = localStorage.getItem("pulse_token");
    const previousRefresh = localStorage.getItem("pulse_refresh");
    const previousUser = useAuthStore.getState().user;
    try {
      const user = await login({ ...values, adding });
      if (adding && user?.role === "admin") {
        await revokeRefresh(localStorage.getItem("pulse_refresh"));
        if (previousToken) localStorage.setItem("pulse_token", previousToken);
        else localStorage.removeItem("pulse_token");
        if (previousRefresh) localStorage.setItem("pulse_refresh", previousRefresh);
        else localStorage.removeItem("pulse_refresh");
        useAuthStore.setState({ user: previousUser, loading: false });
        setFormError("Admin is a separate account and can't be opened from here");
        return;
      }
      await openHome(user, navigate);
    } catch (err) {
      const data = err.response?.data;
      if (data?.needsOtp && data.userId) {
        navigate("/otp", { state: { userId: data.userId, mode: "register", contact: values.contact.trim() } });
        return;
      }
      const message = guestMessage(err, "Couldn't sign in");
      if (message) setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  const onToken = useCallback(async (kind, idToken) => {
    setBusy(true);
    setFormError("");
    const previousToken = localStorage.getItem("pulse_token");
    const previousRefresh = localStorage.getItem("pulse_refresh");
    const previousUser = useAuthStore.getState().user;
    try {
      const user = await social(kind, { idToken, adding });
      if (adding && user?.role === "admin") {
        await revokeRefresh(localStorage.getItem("pulse_refresh"));
        if (previousToken) localStorage.setItem("pulse_token", previousToken);
        else localStorage.removeItem("pulse_token");
        if (previousRefresh) localStorage.setItem("pulse_refresh", previousRefresh);
        else localStorage.removeItem("pulse_refresh");
        useAuthStore.setState({ user: previousUser, loading: false });
        setFormError("Admin is a separate account and can't be opened from here");
        return;
      }
      await openHome(user, navigate);
    } catch (err) {
      const message = guestMessage(err, "Couldn't sign in");
      if (message) setFormError(message);
    } finally {
      setBusy(false);
    }
  }, [social, adding, navigate]);

  async function resume(account) {
    setBusy(true);
    setFormError("");
    try {
      await switchTo(account);
    } catch {
      setSaved(readAccounts());
      setFormError("This session expired. Sign in with the password");
      setValues({ contact: account.username || "", password: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap" data-keep>
      <div className="card auth-card">
        {adding ? (
          <button type="button" className="auth-back" onClick={() => navigate(-1)}>Back</button>
        ) : null}
        <h1 className="brand" data-keep>Pulse</h1>
        <p className="muted auth-lead">{adding ? "Log in with another account. This one stays on this device." : "Log in"}</p>
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
          <Input name="contact" placeholder="Email or username" value={values.contact} onChange={change} error={errors.contact} autoComplete="off" autoCorrect="off" spellCheck={false} />
          <Input name="password" type="password" placeholder="Password" value={values.password} onChange={change} error={errors.password} autoComplete="new-password" />
          {formError ? <p className="error-text">{formError}</p> : null}
          <Button disabled={busy} type="submit">{busy ? "Please wait..." : "Log in"}</Button>
        </form>
        <div className="auth-or"><span>or</span></div>
        <ProviderButtons busy={busy} onToken={onToken} onError={setFormError} />
        <Link className="auth-forgot" to="/forgot-password">Forgot password?</Link>
      </div>
      <div className="card auth-card auth-switch">
        <p>Don't have an account? <Link to={adding ? "/register?add=1" : "/register"}>Sign up</Link></p>
      </div>
    </div>
  );
}
