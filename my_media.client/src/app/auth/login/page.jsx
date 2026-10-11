import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { validateLogin } from "../../../utils/validators";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import SocialAuthSheet from "../../../features/auth/components/SocialAuthSheet";

export default function LoginPage() {
    const navigate = useNavigate();
    const login = useAuthStore((s) => s.login);
    const social = useAuthStore((s) => s.social);
    const [values, setValues] = useState({ contact: "", password: "" });
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [busy, setBusy] = useState(false);
    const [socialKind, setSocialKind] = useState("");

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
            navigate("/");
        } catch (err) {
            setFormError(err.response?.data?.message || "Giriş alınmadı");
        } finally {
            setBusy(false);
        }
    }

    async function provider({ email, fullName }) {
        setBusy(true);
        setFormError("");
        try {
            await social(socialKind, { email, fullName });
            setSocialKind("");
            navigate("/");
        } catch (err) {
            setFormError(err.response?.data?.message || "Alınmadı");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="auth-wrap">
            <div className="card auth-card">
                <h1 className="brand">Pulse</h1>
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
                <p>Hesabın yoxdur? <Link to="/register">Qeydiyyatdan keç</Link></p>
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