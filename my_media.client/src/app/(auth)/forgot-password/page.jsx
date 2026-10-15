import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { authApi, guestMessage } from "../../../features/auth/services/authApi";

export default function ForgotPage() {
  const navigate = useNavigate();
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!contact) {
      setError("Enter an email, phone, or username");
      return;
    }
    try {
      const data = await authApi.forgot({ contact });
      navigate("/otp", { state: { userId: data.userId, mode: "reset", contact } });
    } catch (err) {
      setError(guestMessage(err, "No account found"));
    }
  }

  return (
    <div className="auth-wrap" data-keep>
      <div className="card auth-card">
        <h1>Forgot password</h1>
        <form onSubmit={submit}>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} label="Email, phone, or username" error={error} />
          <Button type="submit">Send code</Button>
        </form>
      </div>
    </div>
  );
}
