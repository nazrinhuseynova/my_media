import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { authApi, authMessage } from "../../../features/auth/services/authApi";

export default function ForgotPage() {
  const navigate = useNavigate();
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!contact) {
      setError("Email, telefon və ya username yazın");
      return;
    }
    try {
      const data = await authApi.forgot({ contact });
      navigate("/otp", { state: { userId: data.userId, mode: "reset", contact } });
    } catch (err) {
      setError(authMessage(err, "İstifadəçi tapılmadı"));
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Şifrəni unutdum</h1>
        <form onSubmit={submit}>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} label="Email / telefon / username" error={error} />
          <Button type="submit">Kod göndər</Button>
        </form>
      </div>
    </div>
  );
}
