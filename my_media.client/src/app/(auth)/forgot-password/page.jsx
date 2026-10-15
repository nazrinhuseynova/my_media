import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { authApi, guestMessage } from "../../../features/auth/services/authApi";

export default function ForgotPage() {
  const navigate = useNavigate();
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const value = contact.trim();
    if (!value) {
      setError("Enter an email, phone, or username");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await authApi.forgot({ contact: value });
      if (!data?.userId) {
        setError("No account found");
        return;
      }
      navigate("/otp", { state: { userId: data.userId, mode: "reset", contact: value } });
    } catch (err) {
      const message = guestMessage(err, "No account found");
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap" data-keep>
      <div className="card auth-card">
        <h1>Forgot password</h1>
        <p className="muted auth-lead">Enter your email, phone, or username. We’ll send a code to reset your password.</p>
        <form onSubmit={submit}>
          <Input
            value={contact}
            onChange={(e) => {
              setContact(e.target.value);
              if (error) setError("");
            }}
            label="Email, phone, or username"
            error={error}
            autoComplete="username"
          />
          <Button disabled={busy} type="submit">{busy ? "Please wait..." : "Send code"}</Button>
        </form>
        <p className="muted auth-switch-inline"><Link to="/login">Back to log in</Link></p>
      </div>
    </div>
  );
}
