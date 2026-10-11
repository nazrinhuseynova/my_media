import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { validateOtp } from "../../../utils/validators";
import { authApi } from "../../../features/auth/services/authApi";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";

export default function OtpPage() {
    const loc = useLocation();
    const navigate = useNavigate();
    const setUser = useAuthStore((s) => s.setUser);
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [seconds, setSeconds] = useState(60);

    useEffect(() => {
        const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(t);
    }, []);

    async function submit(e) {
        e.preventDefault();
        if (!loc.state?.userId) {
            setError("Kod səhifəsinə qeydiyyat və ya şifrə bərpasından gəlin");
            return;
        }
        const msg = validateOtp(code);
        if (msg) {
            setError(msg);
            return;
        }
        try {
            const data = await authApi.verifyOtp({ code: code.trim(), userId: loc.state?.userId });
            if (loc.state?.mode === "reset") {
                navigate("/reset-password", { state: { resetToken: data.resetToken } });
                return;
            }
            if (!data.token) {
                setError("Token alınmadı, yenidən daxil olun");
                return;
            }
            localStorage.setItem("pulse_token", data.token);
            setUser(data.user);
            navigate("/");
        } catch (err) {
            setError("Kod yanlışdır");
        }
    }

    return (
        <div className="auth-wrap">
            <div className="card auth-card">
                <h1>Təsdiq</h1>
                <p className="muted">Email/SMS kodunu daxil edin. {seconds ? `${seconds} san` : "Vaxt bitdi"}</p>
                {loc.state?.previewCode ? <p className="success-text">Kod: {loc.state.previewCode}</p> : null}
                <form onSubmit={submit}>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} label="6 rəqəmli kod" maxLength={6} error={error} />
                    <Button type="submit">Təsdiqlə</Button>
                </form>
            </div>
        </div>
    );
}