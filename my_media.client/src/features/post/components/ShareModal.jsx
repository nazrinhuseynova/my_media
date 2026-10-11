import { useEffect, useState } from "react";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import Avatar from "../../../components/ui/Avatar";
import { useAppStore } from "../../../stores/useAppStore";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { api } from "../../../services/api";
import { useChatStore } from "../../chat/store/useChatStore";

export default function ShareModal() {
  const post = useAppStore((s) => s.shareTarget);
  const setShareTarget = useAppStore((s) => s.setShareTarget);
  const me = useAuthStore((s) => s.user);
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState("");
  const send = useChatStore((s) => s.send);
  const openChat = useChatStore((s) => s.openChat);

  useEffect(() => {
    if (!post) {
      setPeople([]);
      return;
    }
    let alive = true;
    async function load() {
      const [convs, search] = await Promise.all([
        api.get("/api/conversations").catch(() => []),
        api.get("/api/search", { params: { q: "", type: "user" } }).catch(() => ({ users: [] })),
      ]);
      const chatList = Array.isArray(convs) ? convs : [];
      const users = (search?.users || []).filter((u) => u.id && u.id !== me?.id);
      const mapped = users.map((u) => {
        const conv = chatList.find((c) => !c.isGroup && (c.members || []).some((m) => m.id === u.id));
        return {
          key: u.id,
          userId: u.id,
          conversationId: conv?.id,
          username: u.username,
          avatar: u.avatar,
        };
      });
      if (alive) setPeople(mapped);
    }
    load();
    return () => { alive = false; };
  }, [post, me?.id]);

  async function shareTo(person) {
    if (busy) return;
    setBusy(person.key);
    try {
      let id = person.conversationId;
      if (!id && person.userId) {
        const created = await api.post("/api/conversations", { memberIds: [person.userId] });
        id = created.id;
      }
      if (!id) return;
      await openChat(id);
      const reel = Boolean(post.videoUrl);
      await send({ type: reel ? "reel" : "post", sharedPostId: post.id, text: reel ? "Video" : "Paylaşım" });
      setShareTarget(null);
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal open={!!post} onClose={() => setShareTarget(null)} title="DM-də paylaş">
      {people.length === 0 ? (
        <p className="muted">Hələ heç kim yoxdur.</p>
      ) : (
        <div className="share-people">
          {people.map((p) => (
            <button
              key={p.key}
              type="button"
              className="share-person"
              disabled={busy === p.key}
              onClick={() => shareTo(p)}
            >
              <Avatar src={p.avatar} alt={p.username} size="lg" />
              <span>@{p.username}</span>
            </button>
          ))}
        </div>
      )}
      <Button variant="ghost" onClick={() => setShareTarget(null)}>Bağla</Button>
    </Modal>
  );
}
