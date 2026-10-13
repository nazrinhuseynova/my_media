import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";
import Avatar from "../../../components/ui/Avatar";
import { readAccounts } from "../accountVault";
import { useAuthStore } from "../store/useAuthStore";
import { notify } from "../../../stores/useNoticeStore";

export const useAccountSheet = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export default function AccountSheet() {
  const open = useAccountSheet((s) => s.open);
  const hide = useAccountSheet((s) => s.hide);
  const user = useAuthStore((s) => s.user);
  const switchTo = useAuthStore((s) => s.switchTo);
  const removeSaved = useAuthStore((s) => s.removeSaved);
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const list = readAccounts();
    if (user?.id) {
      const index = list.findIndex((row) => row.id === user.id);
      if (index >= 0) {
        list[index] = { ...list[index], username: user.username || list[index].username, fullName: user.fullName || list[index].fullName, avatar: user.avatar || list[index].avatar };
      }
    }
    setAccounts(list);
    setPending(null);
    setBusyId("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") hide();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, user, hide]);

  if (!open) return null;

  async function pick(account) {
    if (account.id === user?.id || busyId) return;
    setBusyId(account.id);
    try {
      await switchTo(account);
    } catch {
      setAccounts(readAccounts());
      setBusyId("");
      notify("Bu hesabın sessiyası bitib. Yenidən daxil ol", true);
    }
  }

  function addAccount() {
    hide();
    navigate("/login?add=1");
  }

  return (
    <div className="account-layer" onClick={hide}>
      <div
        className="account-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="account-grab" />
        <header className="account-head">
          <h2 id="account-sheet-title">Hesablar</h2>
          <button type="button" className="account-close" onClick={hide} aria-label="Bağla">✕</button>
        </header>
        <p className="account-lead">Bu cihazda saxlanan hesablar. Keçid şifrə soruşmur.</p>
        <ul className="account-list">
          {accounts.map((account) => {
            const active = account.id === user?.id;
            return (
              <li key={account.id} className={active ? "is-current" : ""}>
                <button type="button" className="account-row" onClick={() => pick(account)} disabled={!!busyId && busyId !== account.id}>
                  <Avatar src={account.avatar} alt={account.username} />
                  <span className="account-copy">
                    <strong>{account.fullName || account.username}</strong>
                    <span>@{account.username}</span>
                  </span>
                  {active ? <span className="account-check" aria-label="Aktiv hesab">✓</span> : null}
                  {!active && busyId === account.id ? <span className="account-wait">Keçilir</span> : null}
                </button>
                {!active ? (
                  <button type="button" className="account-remove" onClick={() => setPending(account)}>
                    Çıx
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {pending ? (
          <div className="account-confirm">
            <p><strong>@{pending.username}</strong> bu cihazdan silinsin?</p>
            <div>
              <button type="button" onClick={() => setPending(null)}>Qalsın</button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  const target = pending;
                  setPending(null);
                  removeSaved(target).then(() => setAccounts(readAccounts()));
                }}
              >
                Bu cihazdan çıx
              </button>
            </div>
          </div>
        ) : null}
        <button type="button" className="account-add" onClick={addAccount}>
          <span className="account-plus" aria-hidden="true">+</span>
          <span>
            <strong>Hesab əlavə et</strong>
            <span>Başqa hesabla daxil ol</span>
          </span>
        </button>
        {accounts.length > 1 ? (
          <button type="button" className="account-all" onClick={logoutAll}>Bütün hesablardan çıx</button>
        ) : null}
      </div>
    </div>
  );
}
