import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNotificationStore } from "../../../stores/useNotificationStore";
import { api } from "../../../services/api";
import { formatDate } from "../../../utils/formatDate";
import Button from "../../../components/ui/Button";
import Avatar from "../../../components/ui/Avatar";
import { notify } from "../../../stores/useNoticeStore";
import { ListSkeleton } from "../../../components/ui/Skeleton";

const TYPE_LABEL = {
  like: "Bəyənmə",
  comment: "Şərh",
  follow: "İzləmə",
  mention: "İşarə",
  dm: "Mesaj",
  report: "Şikayət",
  moderation: "Nəzarət",
  live_invite: "Canlı dəvət",
};

function whoOf(n) {
  return n.from || n.fromUser || null;
}

export default function NotificationsPage() {
  const { items, hasMore, page, load, markRead } = useNotificationStore();
  const [requests, setRequests] = useState([]);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    load().finally(() => setBooted(true));
    api.get("/api/follow-requests").then((data) => setRequests(Array.isArray(data) ? data : [])).catch(() => setRequests([]));
  }, [load]);

  async function act(id, action) {
    await api.post(`/api/follow-requests/${id}/${action}`);
    const next = await api.get("/api/follow-requests");
    setRequests(Array.isArray(next) ? next : []);
    notify(action === "accept" ? "Sorğu qəbul edildi" : "Sorğu rədd edildi");
    load();
  }

  function hrefFor(n) {
    const text = String(n.text || "").toLowerCase();
    if (n.type === "dm") return "/direct";
    if (n.type === "report" || n.type === "moderation") return null;
    if (n.type === "live_invite" && n.entityId) return `/?live=${n.entityId}`;
    if ((n.type === "like" || n.type === "comment" || n.type === "mention") && n.entityId) {
      if (text.includes("reel")) return `/reels?v=${n.entityId}`;
      return `/p/${n.entityId}`;
    }
    const who = whoOf(n);
    if (n.type === "follow" && who?.username) {
      return `/profile/${who.username}`;
    }
    return null;
  }

  const incoming = items.filter((n) => !n.read && ["like", "comment", "follow", "mention", "report", "moderation", "live_invite"].includes(n.type));
  const history = items.filter((n) => !incoming.some((x) => x.id === n.id));
  const incomingEmpty = requests.length === 0 && incoming.length === 0;

  function Card({ n }) {
    const who = whoOf(n);
    const href = hrefFor(n);
    const inner = (
      <>
        <Avatar src={who?.avatar} alt={who?.username} />
        <div className="notify-copy">
          <p>{n.text}</p>
          <span className="muted">{TYPE_LABEL[n.type] || n.type} · {formatDate(n.createdAt)}</span>
        </div>
        {!n.read ? <span className="notify-unread" /> : null}
      </>
    );
    return href ? (
      <Link to={href} className={`notify-card ${n.read ? "is-read" : ""}`}>{inner}</Link>
    ) : (
      <div className={`notify-card ${n.read ? "is-read" : ""}`}>{inner}</div>
    );
  }

  return (
    <div className="page notify-page">
      <header className="notify-head">
        <div>
          <h2>Bildirişlər</h2>
          <p className="muted">Bəyənmə, şərh, izləmə və şikayət qərarları</p>
        </div>
        <Button variant="ghost" type="button" onClick={markRead}>Hamısını oxu</Button>
      </header>

      <section className="notify-section">
        <h3>Gələnlər</h3>
        {!booted ? <ListSkeleton /> : incomingEmpty ? (
          <p className="notify-empty">Yeni bəyənmə, şərh, izləmə və ya şikayət qərarı yoxdur</p>
        ) : (
          <>
            {requests.map((r) => (
              <div key={r.id} className="notify-card">
                <Link to={`/profile/${r.from?.username}`} className="notify-who">
                  <Avatar src={r.from?.avatar} alt={r.from?.username} />
                  <span>
                    <strong>{r.from?.username}</strong>
                    <span className="muted"> səni izləmək istəyir</span>
                  </span>
                </Link>
                <div className="notify-actions">
                  <Button type="button" onClick={() => act(r.id, "accept")}>Qəbul</Button>
                  <Button variant="ghost" type="button" onClick={() => act(r.id, "reject")}>Rədd</Button>
                </div>
              </div>
            ))}
            {incoming.map((n) => <Card key={n.id} n={n} />)}
          </>
        )}
      </section>

      <section className="notify-section">
        <h3>Tarixçə</h3>
        {history.length === 0 ? (
          <p className="notify-empty">Bildiriş yoxdur</p>
        ) : history.map((n) => <Card key={n.id} n={n} />)}
        {hasMore ? <Button variant="ghost" type="button" onClick={() => load(page + 1)}>Daha çox</Button> : null}
      </section>

      <Link className="notify-settings" to="/settings">Bildiriş ayarları</Link>
    </div>
  );
}
