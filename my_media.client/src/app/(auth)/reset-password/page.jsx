import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { validatePassword } from "../../../utils/validators";
import { authApi, authMessage } from "../../../features/auth/services/authApi";

export default function ResetPasswordPage() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const msg = validatePassword(password);
    if (msg) {
      setError(msg);
      return;
    }
    if (password !== confirm) {
      setError("Şifrələr eyni deyil");
      return;
    }
    if (!loc.state?.resetToken) {
      setError("Şifrə bərpasına kod səhifəsindən gəlin");
      return;
    }
    try {
      await authApi.reset({ resetToken: loc.state.resetToken, password });
      navigate("/login");
    } catch (err) {
      setError(authMessage(err, "Şifrə yenilənmədi"));
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Yeni şifrə</h1>
        <form onSubmit={submit}>
          <Input type="password" label="Yeni şifrə" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input type="password" label="Təkrarla" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={error} />
          <Button type="submit">Yadda saxla</Button>
        </form>
      </div>
    </div>
  );
}
