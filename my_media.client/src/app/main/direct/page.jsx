import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../../../services/api";
import { useChatStore } from "../../../features/chat/store/useChatStore";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import Avatar from "../../../components/ui/Avatar";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/ui/Icon";
import { formatDate } from "../../../utils/formatDate";
import { onSocket, connectSocket } from "../../../lib/socket";
import { uploadFile } from "../../../utils/upload";

async function resolveUsernames(raw) {
  const names = String(raw || "")
    .split(/[,\s]+/)
    .map((s) => s.replace(/^@/, "").trim())
    .filter(Boolean);
  const ids = [];
  for (const name of names) {
    const res = await api.get("/api/search", { params: { q: name, type: "user" } });
    const list = Array.isArray(res.users) ? res.users : [];
    const match = list.find((u) => u.username.toLowerCase() === name.toLowerCase());
    if (match) ids.push(match.id);
  }
  return [...new Set(ids)];
}

function chatTitle(c) {
  if (!c) return "";
  if (c.isGroup) return c.title || "Qrup";
  return c.members?.map((m) => m.username).join(", ") || "Söhbət";
}

export default function DirectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const { conversations, loadConversations, openChat, messages, send, typing } = useChatStore();
  const [text, setText] = useState("");
  const [typingName, setTypingName] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [members, setMembers] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef();
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const bottomRef = useRef();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (id) openChat(id);
    const sock = connectSocket();
    sock.joinConversation?.(id);
    return onSocket("message", (p) => {
      if (p.conversationId === id) {
        useChatStore.setState((s) => {
          if (s.messages.some((m) => m.id === p.id)) return s;
          return { messages: [...s.messages, p] };
        });
        loadConversations();
      }
    });
  }, [id, openChat, loadConversations]);

  useEffect(() => {
    return onSocket("messagesRead", (p) => {
      if (String(p.conversationId) !== String(id)) return;
      useChatStore.setState((s) => ({
        messages: s.messages.map((row) => {
          const readBy = row.readBy || [];
          if (readBy.some((x) => String(x) === String(p.userId))) return row;
          return { ...row, readBy: [...readBy, String(p.userId)] };
        }),
      }));
    });
  }, [id]);

  useEffect(() => {
    return onSocket("messageDeleted", (p) => {
      if (String(p.conversationId) !== String(id)) return;
      useChatStore.setState((s) => ({
        messages: s.messages.map((row) => String(row.id) === String(p.id) ? { ...row, deleted: true, text: "Mesaj silindi", mediaUrl: "", type: "text" } : row),
      }));
    });
  }, [id]);

  useEffect(() => {
    let timer;
    return onSocket("typing", (p) => {
      if (p.conversationId === id && String(p.userId) !== String(me?.id)) {
        setTypingName("Yazır...");
        clearTimeout(timer);
        timer = setTimeout(() => setTypingName(""), 1500);
      }
    });
  }, [id, me?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, id]);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() || !id) return;
    await send({ type: "text", text: text.trim() });
    setText("");
    loadConversations();
  }

  async function sendFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;
    const type = file.type.startsWith("video") ? "video" : "image";
    const uploaded = await uploadFile(file, type);
    await send({ type, mediaUrl: uploaded.url, mediaExtension: uploaded.extension, text: file.name });
    loadConversations();
  }

  async function recordVoice() {
    if (!id) return;
    if (recording && recRef.current) {
      if (recRef.current.state === "recording") recRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Bu brauzer səs yazmağı dəstəkləmir");
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      const chunks = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        streamRef.current = null;
        setRecording(false);
        if (!chunks.length) return;
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          const file = new File([blob], "voice.webm", { type: blob.type || "audio/webm" });
          const uploaded = await uploadFile(file, "audio");
          await send({ type: "audio", mediaUrl: uploaded.url, mediaExtension: uploaded.extension, text: "Səs mesajı" });
          loadConversations();
        } catch (err) {
          setError(err.response?.data?.message || "Səs göndərilmədi");
        }
      };
      rec.start();
      setRecording(true);
    } catch (err) {
      setRecording(false);
      recRef.current = null;
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || /dismissed|denied|Permission/i.test(err?.message || "")) {
        setError("Mikrofon icazəsi verilmədi");
      } else if (name === "NotFoundError") {
        setError("Mikrofon tapılmadı");
      } else {
        setError("Səs yazılmadı");
      }
    }
  }

  async function startChat(isGroup) {
    setError("");
    try {
      const memberIds = await resolveUsernames(members || query);
      if (!memberIds.length) {
        setError("İstifadəçi tapılmadı");
        return;
      }
      const conv = await api.post("/api/conversations", {
        isGroup,
        title: isGroup ? groupTitle.trim() : "",
        memberIds,
      });
      setMembers("");
      setGroupTitle("");
      setQuery("");
      await loadConversations();
      navigate(`/direct/${conv.id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Söhbət açılmadı");
    }
  }

  const active = conversations.find((c) => c.id === id);
  const filtered = conversations.filter((c) => {
    if (!query.trim()) return true;
    return chatTitle(c).toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="page direct-page">
      <div className={`chat-layout${id ? " has-thread" : ""}`}>
        <aside className="chat-list">
          <div className="chat-list-head">
            <h3>Mesajlar</h3>
            <input
              className="chat-search"
              placeholder="Axtar və ya username yaz"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="chat-new">
              <input placeholder="Qrup adı" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} />
              <input placeholder="username-lər (vergüllə)" value={members} onChange={(e) => setMembers(e.target.value)} />
              <div className="chat-new-actions">
                <Button variant="ghost" type="button" onClick={() => startChat(false)}>Söhbət aç</Button>
                <Button type="button" onClick={() => startChat(true)}>Qrup yarat</Button>
              </div>
              {error ? <p className="error-text">{error}</p> : null}
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="notify-empty" style={{ margin: 12 }}>Söhbət yoxdur</p>
          ) : filtered.map((c) => (
            <button key={c.id} type="button" className={`chat-item ${c.id === id ? "active" : ""}`} onClick={() => navigate(`/direct/${c.id}`)}>
              <Avatar src={c.members[0]?.avatar} />
              <div className="chat-item-copy">
                <strong>{chatTitle(c)}</strong>
                <span className="muted">{c.last?.text || "Yeni söhbət"}</span>
              </div>
              {c.unread ? <span className="notify-unread" /> : null}
            </button>
          ))}
        </aside>

        <section className="chat-thread">
          {id ? (
            <>
              <header className="chat-thread-head">
                <button type="button" className="chat-back" onClick={() => navigate("/direct")} aria-label="Söhbətlər">
                  <Icon name="back" size={20} />
                </button>
                <Avatar src={active?.members[0]?.avatar} />
                <div>
                  <strong>{chatTitle(active)}</strong>
                  {typingName ? <div className="muted">{typingName}</div> : <div className="muted">{active?.members?.[0]?.isOnline ? "onlayn" : "oflayn"}</div>}
                </div>
              </header>
              <div className="messages">
                {messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.senderId === me.id ? "me" : ""}`}>
                    {active?.isGroup ? <div className="bubble-name">{m.sender?.username}</div> : null}
                    {!m.deleted && m.type === "image" ? <img src={m.mediaUrl} alt="" /> : null}
                    {!m.deleted && m.type === "video" ? <video src={m.mediaUrl} controls /> : null}
                    {!m.deleted && m.type === "audio" ? <audio src={m.mediaUrl} controls /> : null}
                    {!m.deleted && m.type === "post" && m.sharedPostId ? <Link to={`/p/${m.sharedPostId}`}>Paylaşıma bax</Link> : null}
                    {!m.deleted && m.type === "reel" && m.sharedPostId ? <Link to={`/reels?v=${m.sharedPostId}`}>Videoya bax</Link> : null}
                    {m.text ? <div>{m.text}</div> : null}
                    <div className="bubble-meta">
                      {formatDate(m.createdAt)} · {m.readBy?.length > 1 ? "oxundu" : "göndərildi"}
                      {m.senderId === me.id && !m.deleted ? (
                        <button type="button" onClick={async () => {
                          await api.delete(`/api/conversations/${id}/messages/${m.id}`);
                          useChatStore.setState((s) => ({ messages: s.messages.map((row) => row.id === m.id ? { ...row, deleted: true, text: "Mesaj silindi", mediaUrl: "" } : row) }));
                        }}>Sil</button>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              {error ? <p className="error-text" style={{ padding: "0 12px" }}>{error}</p> : null}
              <form className="chat-composer" onSubmit={submit}>
                <input
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    typing();
                    connectSocket().typing?.(id);
                  }}
                  placeholder="Mesaj yaz..."
                />
                <input ref={mediaRef} type="file" accept="image/*,video/*,image/jpeg,image/png,video/mp4" hidden onChange={sendFile} />
                <button className="chat-icon-btn" type="button" title="Kamera" onClick={() => mediaRef.current.click()}>
                  <Icon name="camera" size={22} />
                </button>
                <button className={`chat-icon-btn${recording ? " is-rec" : ""}`} type="button" title="Mikrofon" onClick={recordVoice}>
                  <Icon name="mic" size={22} />
                </button>
                <Button type="submit">Göndər</Button>
              </form>
            </>
          ) : (
            <div className="chat-empty">
              <p>Soldan söhbət seç, və ya username yazıb Söhbət aç</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
