import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { validateOtp } from "../../../utils/validators";
import { authApi, authMessage } from "../../../features/auth/services/authApi";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import { deviceLabel } from "../../../features/auth/accountVault";

export default function OtpPage() {
  const loc = useLocation();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      const data = await authApi.verifyOtp({ code: code.trim(), userId: loc.state?.userId, device: deviceLabel() });
      if (loc.state?.mode === "reset") {
        navigate("/reset-password", { state: { resetToken: data.resetToken } });
        return;
      }
      if (!data.token) {
        setError("Token alınmadı, yenidən daxil olun");
        return;
      }
      localStorage.setItem("pulse_token", data.token);
      if (data.refreshToken) localStorage.setItem("pulse_refresh", data.refreshToken);
      setUser(data.user);
      window.location.assign("/");
    } catch (err) {
      setError(authMessage(err, "Kod yanlışdır"));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!loc.state?.userId || seconds > 0) return;
    setError("");
    try {
      await authApi.resendOtp({
        userId: loc.state.userId,
        type: loc.state?.mode === "reset" ? "reset" : "register",
      });
      setSeconds(60);
    } catch (err) {
      setError(authMessage(err, "Kod göndərilmədi"));
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Təsdiq</h1>
        <p className="muted">
          {loc.state?.contact
            ? `Kod ${loc.state.contact} ünvanına göndərildi. Təsdiqdən sonra qeydiyyat tamamlanır.`
            : "Kod emailinə göndərildi. Təsdiqdən sonra davam edə bilərsən."}
          {" "}
          {seconds
            ? `Yenidən göndərmək üçün ${seconds} san`
            : "Kodu almamısansa, yenidən göndər"}
        </p>
        <form onSubmit={submit}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} label="6 rəqəmli kod" maxLength={6} error={error} />
          <Button disabled={busy} type="submit">{busy ? "Gözləyin..." : "Təsdiqlə"}</Button>
        </form>
        <Button variant="ghost" type="button" disabled={seconds > 0} onClick={resend}>Kodu yenidən göndər</Button>
      </div>
    </div>
  );
}
