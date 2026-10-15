import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { validatePasswordEn } from "../../../utils/validators";
import { authApi, guestMessage } from "../../../features/auth/services/authApi";

export default function ResetPasswordPage() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const msg = validatePasswordEn(password);
    if (msg) {
      setError(msg);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (!loc.state?.resetToken) {
      setError("Open this page from the code screen");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await authApi.reset({ resetToken: loc.state.resetToken, password });
      navigate("/login", { replace: true });
    } catch (err) {
      const message = guestMessage(err, "Couldn't update the password");
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap" data-keep>
      <div className="card auth-card">
        <h1>New password</h1>
        <form onSubmit={submit}>
          <Input
            type="password"
            label="New password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            autoComplete="new-password"
          />
          <Input
            type="password"
            label="Repeat password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (error) setError("");
            }}
            error={error}
            autoComplete="new-password"
          />
          <Button disabled={busy} type="submit">{busy ? "Please wait..." : "Save"}</Button>
        </form>
      </div>
    </div>
  );
}
