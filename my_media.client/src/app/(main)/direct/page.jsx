import { useEffect, useMemo, useRef, useState } from "react";
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
import { notify } from "../../../stores/useNoticeStore";
import ChatPeopleRail from "../../../features/chat/components/ChatPeopleRail";
import VoiceNotePlayer from "../../../features/chat/components/VoiceNotePlayer";
import { ExpressionButton, insertAtCursor } from "../../../features/expression/ExpressionPicker";

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
  const { conversations, loadConversations, openChat, messages, send, typing, hasMoreMessages, loadOlder } = useChatStore();
  const [text, setText] = useState("");
  const [typingName, setTypingName] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [members, setMembers] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [following, setFollowing] = useState([]);
  const [menuId, setMenuId] = useState("");
  const [menuBox, setMenuBox] = useState(null);
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const mediaRef = useRef();
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const bottomRef = useRef();
  const textRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!me?.username) return;
    api.get(`/api/users/${me.username}/following`)
      .then((list) => setFollowing(Array.isArray(list) ? list : []))
      .catch(() => setFollowing([]));
  }, [me?.username]);

  const [presence, setPresence] = useState({});

  useEffect(() => {
    return onSocket("presence", (p) => {
      if (!p?.userId) return;
      setPresence((map) => ({ ...map, [String(p.userId)]: Boolean(p.online) }));
    });
  }, []);

  const people = useMemo(() => {
    const resolveOnline = (base, live) => {
      // null = məxfilik bağlı → nöqtə yox; true=yaşıl; false=boz
      if (base?.isOnline == null && typeof live !== "boolean") return null;
      if (typeof live === "boolean") return live;
      return Boolean(base.isOnline);
    };

    const map = new Map();
    for (const conv of conversations) {
      for (const member of conv.members || []) {
        if (!member?.id || String(member.id) === String(me?.id)) continue;
        const prev = map.get(member.id);
        const directId = conv.isGroup ? prev?.convId || null : conv.id;
        const live = presence[String(member.id)];
        map.set(member.id, {
          ...member,
          isOnline: resolveOnline(member, live),
          convId: directId,
        });
      }
    }
    for (const person of following) {
      if (!person?.id || String(person.id) === String(me?.id)) continue;
      const prev = map.get(person.id);
      const live = presence[String(person.id)];
      const base = prev || person;
      const online = resolveOnline(base, live);
      if (prev) {
        map.set(person.id, {
          ...prev,
          isOnline: online,
          noteText: person.noteText || prev.noteText,
          noteKind: person.noteKind || prev.noteKind,
        });
      } else {
        map.set(person.id, { ...person, isOnline: online, convId: null });
      }
    }
    return [...map.values()].sort((a, b) => Number(b.isOnline === true) - Number(a.isOnline === true));
  }, [conversations, following, me?.id, presence]);

  const railPeople = useMemo(() => people.slice(0, 24), [people]);

  async function setMyNote(text, kind) {
    try {
      const next = await api.patch("/api/profile/note", {
        text: (text || "").trim(),
        kind: kind || "text",
      });
      useAuthStore.getState().setUser(next);
      notify((text || "").trim() ? "Durum yeniləndi" : "Durum silindi");
    } catch (err) {
      notify(err.response?.data?.message || "Durum saxlanmadı", true);
      throw err;
    }
  }

  async function openPerson(person) {
    if (person.convId) {
      navigate(`/direct/${person.convId}`);
      return;
    }
    setError("");
    try {
      const conv = await api.post("/api/conversations", {
        isGroup: false,
        title: "",
        memberIds: [person.id],
      });
      await loadConversations();
      navigate(`/direct/${conv.id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Söhbət açılmadı");
    }
  }

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
    return onSocket("messageEdited", (p) => {
      if (String(p.conversationId) !== String(id)) return;
      useChatStore.setState((s) => ({
        messages: s.messages.map((row) => String(row.id) === String(p.id) ? p : row),
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
    if (editing) {
      const updated = await api.patch(`/api/conversations/${id}/messages/${editing.id}`, { text: text.trim() });
      useChatStore.setState((s) => ({
        messages: s.messages.map((row) => row.id === updated.id ? updated : row),
      }));
      setEditing(null);
      setText("");
      notify("Mesaj yeniləndi");
      return;
    }
    await send({ type: "text", text: text.trim(), replyToId: reply?.id || "" });
    setText("");
    setReply(null);
    loadConversations();
  }

  function copyMessage(message) {
    const value = message.deleted ? "" : (message.text || "");
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setMenuId("");
  }

  async function unsend(message) {
    await api.delete(`/api/conversations/${id}/messages/${message.id}`);
    notify("Mesaj geri alındı");
    useChatStore.setState((s) => ({
      messages: s.messages.map((row) => row.id === message.id ? { ...row, deleted: true, text: "Mesaj silindi", mediaUrl: "", type: "text" } : row),
    }));
    setMenuId("");
  }

  async function hideForMe(message) {
    await api.post(`/api/conversations/${id}/messages/${message.id}/hide`);
    notify("Mesaj gizlədildi");
    useChatStore.setState((s) => ({ messages: s.messages.filter((row) => row.id !== message.id) }));
    setMenuId("");
  }

  async function forwardTo(convId) {
    if (!forwardMsg || forwardMsg.deleted) return;
    await api.post(`/api/conversations/${convId}/messages`, {
      type: forwardMsg.type || "text",
      text: forwardMsg.text || "",
      mediaUrl: forwardMsg.mediaUrl || "",
      mediaExtension: forwardMsg.mediaExtension || "",
      sharedPostId: forwardMsg.sharedPostId || "",
    });
    setForwardMsg(null);
    setMenuId("");
    notify("Mesaj yönləndirildi");
    await loadConversations();
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
      setError("Bu cihazda səs yazmaq olmur");
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
    <div className="page direct-page stage-lock">
      <div className={`chat-layout${id ? " has-thread" : ""}`}>
        <aside className="chat-list">
          {railPeople.length || me ? (
            <ChatPeopleRail
              people={railPeople}
              me={me}
              onOpen={openPerson}
              onSetNote={setMyNote}
            />
          ) : null}
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
                {hasMoreMessages ? (
                  <button type="button" className="btn btn-ghost" onClick={() => loadOlder()}>Əvvəlki mesajlar</button>
                ) : null}
                {messages.map((m) => {
                  const mine = m.senderId === me.id;
                  const read = mine && (m.readBy?.length || 0) > 1;
                  const mediaOnly = !m.deleted && ["image", "video"].includes(m.type);
                  const hideCaption = m.deleted || ["location", "music", "status", "audio"].includes(m.type);
                  return (
                    <div
                      key={m.id}
                      className={`msg-row${mine ? " me" : ""}${m.deleted ? " is-deleted" : ""}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenuBox({ top: e.clientY, left: Math.max(8, Math.min(e.clientX, window.innerWidth - 196)) });
                        setMenuId(m.id);
                      }}
                    >
                      <div className={`msg-stack${mine ? " me" : ""}`}>
                        <div className={`bubble${mine ? " me" : ""}${mediaOnly ? " is-media" : ""}${m.deleted ? " is-deleted" : ""}`}>
                          {active?.isGroup && !mine ? <div className="bubble-name">{m.sender?.username}</div> : null}
                          {!m.deleted && m.replyText ? (
                            <div className="msg-quote">
                              <strong>{m.replyUser || "Mesaj"}</strong>
                              <span>{m.replyText}</span>
                            </div>
                          ) : null}
                          {m.deleted ? (
                            <div className="msg-text msg-deleted">Mesaj silindi</div>
                          ) : null}
                          {!m.deleted && m.type === "image" ? <img src={m.mediaUrl} alt="" /> : null}
                          {!m.deleted && m.type === "video" ? <video src={m.mediaUrl} controls playsInline /> : null}
                          {!m.deleted && m.type === "audio" ? <VoiceNotePlayer src={m.mediaUrl} mine={mine} /> : null}
                          {!m.deleted && m.type === "post" && m.sharedPostId ? (
                            <Link className="msg-card-link" to={`/p/${m.sharedPostId}`}>
                              <strong>Paylaşım</strong>
                              <span>Posta bax</span>
                            </Link>
                          ) : null}
                          {!m.deleted && m.type === "reel" && m.sharedPostId ? (
                            <Link className="msg-card-link" to={`/reels?v=${m.sharedPostId}`}>
                              <strong>Reel</strong>
                              <span>Videoya bax</span>
                            </Link>
                          ) : null}
                          {!m.deleted && m.type === "location" ? (
                            <div className="msg-share"><span className="msg-share-ico">⌖</span><div><strong>Məkan</strong><span>{m.text}</span></div></div>
                          ) : null}
                          {!m.deleted && m.type === "music" ? (
                            <div className="msg-share"><span className="msg-share-ico">♫</span><div><strong>Musiqi</strong><span>{m.text}</span></div></div>
                          ) : null}
                          {!m.deleted && m.type === "status" ? (
                            <div className="msg-share"><span className="msg-share-ico">💬</span><div><strong>Durum</strong><span>{m.text}</span></div></div>
                          ) : null}
                          {!hideCaption && m.text ? <div className="msg-text">{m.text}</div> : null}
                          <button
                            type="button"
                            className="msg-more"
                            aria-label="Mesaj əməliyyatları"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (menuId === m.id) {
                                setMenuId("");
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenuBox({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left - 140, window.innerWidth - 196)) });
                              setMenuId(m.id);
                            }}
                          >
                            ···
                          </button>
                        </div>
                        <div className={`msg-meta${mine ? " me" : ""}`}>
                          <span>{formatDate(m.createdAt)}</span>
                          {m.edited ? <span>düzəldildi</span> : null}
                          {mine ? <span className={`msg-ticks${read ? " is-read" : ""}`} aria-label={read ? "Oxundu" : "Göndərildi"}>✓{read ? "✓" : ""}</span> : null}
                        </div>
                      </div>
                      {menuId === m.id ? (
                        <div className="msg-menu" role="menu" style={menuBox || undefined}>
                          {!m.deleted ? <button type="button" onClick={() => { setReply(m); setEditing(null); setMenuId(""); }}>Yanıtla</button> : null}
                          {!m.deleted && m.text ? <button type="button" onClick={() => copyMessage(m)}>Kopyala</button> : null}
                          {!m.deleted ? <button type="button" onClick={() => { setForwardMsg(m); setMenuId(""); }}>İlet</button> : null}
                          {mine && !m.deleted && m.type === "text" ? <button type="button" onClick={() => { setEditing(m); setReply(null); setText(m.text || ""); setMenuId(""); }}>Düzəlt</button> : null}
                          <button type="button" onClick={() => hideForMe(m)}>Özün üçün sil</button>
                          {mine && !m.deleted ? <button type="button" onClick={() => unsend(m)}>Geri al</button> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              {error ? <p className="error-text" style={{ padding: "0 12px" }}>{error}</p> : null}
              {reply ? (
                <div className="msg-banner">
                  <span>Yanıt: {reply.text || "Media"}</span>
                  <button type="button" onClick={() => setReply(null)}>Bağla</button>
                </div>
              ) : null}
              {editing ? (
                <div className="msg-banner">
                  <span>Düzəliş</span>
                  <button type="button" onClick={() => { setEditing(null); setText(""); }}>Bağla</button>
                </div>
              ) : null}
              <form className="chat-composer" onSubmit={submit}>
                <ExpressionButton
                  className="chat-expr"
                  onPick={async (payload) => {
                    if (payload.kind === "emoji" || payload.kind === "sticker") {
                      insertAtCursor(textRef, payload.text, text, setText);
                      return;
                    }
                    try {
                      await send({ type: payload.kind === "music" ? "music" : "location", text: payload.text });
                      loadConversations();
                    } catch (err) {
                      setError(err.response?.data?.message || "Göndərilmədi");
                    }
                  }}
                />
                <input
                  ref={textRef}
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
      {forwardMsg ? (
        <div className="msg-forward" role="dialog" aria-label="İlet">
          <div className="msg-forward-card">
            <strong>İlet</strong>
            <button type="button" className="msg-forward-close" onClick={() => setForwardMsg(null)}>Bağla</button>
            {conversations.filter((c) => c.id !== id).map((c) => (
              <button key={c.id} type="button" className="msg-forward-item" onClick={() => forwardTo(c.id)}>
                {chatTitle(c)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
