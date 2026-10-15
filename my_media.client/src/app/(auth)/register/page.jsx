import { useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { validateRegisterEn } from "../../../utils/validators";
import { authApi, guestMessage } from "../../../features/auth/services/authApi";
import { openHome, useAuthStore } from "../../../features/auth/store/useAuthStore";
import { rememberAccount } from "../../../features/auth/accountVault";
import { armTour } from "../../../features/tour/tourFlag";
import ProviderButtons from "../../../features/auth/components/ProviderButtons";

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
  const [fresh, setFresh] = useState(false);

  function change(e) {
    setValues({ ...values, [e.target.name]: e.target.value });
    if (formError) setFormError("");
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: "" });
  }

  async function submit(e) {
    e.preventDefault();
    const next = validateRegisterEn(values);
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
      if (data?.token && data?.user) {
        armTour(data.user);
        rememberAccount(data.user, data.token, data.refreshToken);
        useAuthStore.setState({ user: data.user, loading: false });
        await openHome(data.user, navigate);
        return;
      }
      navigate("/otp", { state: { userId: data.userId, mode: "register", contact: payload.contact } });
    } catch (err) {
      const message = guestMessage(err, "Couldn't sign up");
      if (message) setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  const onToken = useCallback(async (kind, idToken) => {
    setBusy(true);
    setFormError("");
    try {
      const user = await social(kind, { idToken, fullName: `${values.firstName} ${values.lastName}`.trim(), adding });
      await openHome(user, navigate);
    } catch (err) {
      const message = guestMessage(err, "Couldn't sign up");
      if (message) setFormError(message);
    } finally {
      setBusy(false);
    }
  }, [social, values.firstName, values.lastName, adding, navigate]);

  return (
    <div className="auth-wrap auth-wrap-register" data-keep>
      <div className="card auth-card">
        <h1 className="brand" data-keep>Pulse</h1>
        <p className="muted auth-lead">Sign up with email. A code is sent to that email, then the account opens.</p>
        <form autoComplete="off" onSubmit={submit}>
          <div className="auth-row">
            <Input name="firstName" label="First name" value={values.firstName} onChange={change} error={errors.firstName} autoComplete="off" />
            <Input name="lastName" label="Last name" value={values.lastName} onChange={change} error={errors.lastName} autoComplete="off" />
          </div>
          <Input name="username" label="Username" value={values.username} onChange={change} error={errors.username} autoComplete="off" />
          <Input name="contact" label="Email" type="email" value={values.contact} onChange={change} error={errors.contact} autoComplete="off" inputMode="email" spellCheck={false} />
          <Input name="password" type="password" label="Password" value={values.password} onChange={change} error={errors.password} autoComplete="new-password" readOnly={!fresh} onFocus={() => setFresh(true)} />
          <Input name="confirmPassword" type="password" label="Repeat password" value={values.confirmPassword} onChange={change} error={errors.confirmPassword} autoComplete="new-password" readOnly={!fresh} onFocus={() => setFresh(true)} />
          {formError ? <p className="error-text">{formError}</p> : null}
          <Button disabled={busy} type="submit">{busy ? "Please wait..." : "Sign up"}</Button>
        </form>
        <ProviderButtons divider busy={busy} onToken={onToken} onError={setFormError} />
        <p className="muted auth-switch-inline">Already have an account? <Link to={adding ? "/login?add=1" : "/login"}>Log in</Link></p>
      </div>
    </div>
  );
}
