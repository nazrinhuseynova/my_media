import { useEffect, useState } from "react";
import Modal from "../../../components/ui/Modal/Modal";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import { isEmail } from "../../../utils/validators";
import { authMessage } from "../services/authApi";

export default function SocialAuthSheet({ kind, open, onClose, onSubmit, busy }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setFullName("");
    setError("");
  }, [open, kind]);

  async function submit(e) {
    e.preventDefault();
    if (!isEmail(email)) {
      setError("Düzgün email yazın");
      return;
    }
    setError("");
    try {
      await onSubmit({ email: email.trim(), fullName: fullName.trim() });
    } catch (err) {
      setError(authMessage(err, "Daxil olmaq alınmadı"));
    }
  }

  const title = kind === "apple" ? "Apple ilə davam et" : "Google ilə davam et";

  return (
    <Modal title={title} open={open} onClose={onClose}>
      <form className="social-sheet-form" autoComplete="off" onSubmit={submit}>
        <p className="muted">Email yazın. Bu email ilə hesab tapılacaq, yoxdursa yeni hesab açılacaq.</p>
        <input tabIndex={-1} aria-hidden="true" autoComplete="email" style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }} />
        <Input
          type="text"
          inputMode="email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Input
          label="Ad Soyad (istəyə bağlı)"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="off"
        />
        <Button disabled={busy} type="submit">{busy ? "Gözləyin..." : "Davam et"}</Button>
        <Button variant="ghost" type="button" onClick={onClose}>Ləğv et</Button>
      </form>
    </Modal>
  );
}
