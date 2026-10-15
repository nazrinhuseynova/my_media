import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { validateOtpEn } from "../../../utils/validators";
import { authApi, guestMessage } from "../../../features/auth/services/authApi";
import { openHome, useAuthStore } from "../../../features/auth/store/useAuthStore";
import { deviceLabel } from "../../../features/auth/accountVault";
import { armTour } from "../../../features/tour/tourFlag";

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
      setError("Open this page from sign up or password reset");
      return;
    }
    const msg = validateOtpEn(code);
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
        setError("Sign-in didn't finish. Try again");
        return;
      }
      if (loc.state?.mode === "register") armTour(data.user);
      localStorage.setItem("pulse_token", data.token);
      if (data.refreshToken) localStorage.setItem("pulse_refresh", data.refreshToken);
      setUser(data.user);
      await openHome(data.user, navigate);
    } catch (err) {
      setError(guestMessage(err, "That code is wrong or expired"));
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
      setError(guestMessage(err, "Couldn't send the code"));
    }
  }

  return (
    <div className="auth-wrap" data-keep>
      <div className="card auth-card">
        <h1>Confirmation</h1>
        <p className="muted">
          {loc.state?.contact
            ? `A code was sent to ${loc.state.contact}. Enter it to finish.`
            : "A code was sent to your email. Enter it to continue."}
          {" "}
          {seconds
            ? `You can resend it in ${seconds}s`
            : "Didn't get the code? Send it again"}
        </p>
        <form onSubmit={submit}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} label="6-digit code" maxLength={6} error={error} />
          <Button disabled={busy} type="submit">{busy ? "Please wait..." : "Confirm"}</Button>
        </form>
        <Button variant="ghost" type="button" disabled={seconds > 0} onClick={resend}>Send code again</Button>
      </div>
    </div>
  );
}
