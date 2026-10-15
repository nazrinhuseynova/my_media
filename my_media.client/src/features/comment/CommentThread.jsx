import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "../../components/ui/Avatar";
import { useAuthStore } from "../auth/store/useAuthStore";
import { notify } from "../../stores/useNoticeStore";
import { api } from "../../services/api";
import ExpressionPicker, { insertAtCursor } from "../expression/ExpressionPicker";

/** StoryViewer və digər yerlər üçün — tam expression picker */
export function EmojiPad({ onPick }) {
  return (
    <ExpressionPicker
      tabs={["emoji", "sticker", "music", "location"]}
      onPick={(payload) => {
        if (payload.kind === "emoji" || payload.kind === "sticker") onPick?.(payload.text);
        else onPick?.((payload.kind === "music" ? `♫ ${payload.text}` : `⌖ ${payload.text}`));
      }}
    />
  );
}

const REACTIONS = [
  { type: "like", emoji: "👍", label: "Bəyəndim" },
  { type: "celebrate", emoji: "👏", label: "Təbrik" },
  { type: "support", emoji: "🫶", label: "Dəstək" },
  { type: "love", emoji: "❤️", label: "Sevgi" },
  { type: "insightful", emoji: "💡", label: "Maraqlı" },
  { type: "funny", emoji: "😄", label: "Gülməli" },
];

function orderComments(list) {
  const rows = Array.isArray(list) ? list : [];
  const byParent = new Map();
  rows.forEach((row) => {
    const key = row.parentId || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  });
  const ordered = [];
  const walk = (parentId, depth) => {
    (byParent.get(parentId) || []).forEach((row) => {
      ordered.push({ ...row, depth });
      walk(row.id, depth + 1);
    });
  };
  walk("", 0);
  const seen = new Set(ordered.map((row) => row.id));
  rows.forEach((row) => {
    if (!seen.has(row.id)) ordered.push({ ...row, depth: row.parentId ? 1 : 0 });
  });
  return ordered;
}

export default function CommentThread({ comments, onChange, submit, react, edit, remove }) {
  const me = useAuthStore((s) => s.user);
  const [text, setText] = useState("");
  const [parent, setParent] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editing, setEditing] = useState("");
  const [reactingId, setReactingId] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const list = orderComments(comments);

  function insertEmoji(emoji) {
    insertAtCursor(inputRef, emoji, text, setText);
  }

  function applyExpression(payload) {
    if (payload.kind === "emoji" || payload.kind === "sticker") {
      insertEmoji(payload.text);
      return;
    }
    const stamp = payload.kind === "music" ? `♫ ${payload.text}` : `⌖ ${payload.text}`;
    insertAtCursor(inputRef, (text && !text.endsWith(" ") ? " " : "") + stamp, text, setText);
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const created = await submit({ text: text.trim(), parentId: parent?.id || null });
      onChange?.([...(Array.isArray(comments) ? comments : []), created]);
      setText("");
      setParent(null);
      setEmojiOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function reactTo(comment, type) {
    if (!react) return;
    const res = await react(comment, type);
    onChange?.((Array.isArray(comments) ? comments : []).map((row) => (row.id === comment.id ? { ...row, ...res } : row)));
  }

  async function saveEdit(comment) {
    if (!edit || !editing.trim()) return;
    const next = await edit(comment, editing.trim());
    onChange?.((Array.isArray(comments) ? comments : []).map((row) => (row.id === comment.id ? next : row)));
    setEditingId("");
    notify("Şərh yadda saxlandı");
  }

  async function reportComment(comment) {
    try {
      await api.post("/api/reports", { targetType: "comment", targetId: comment.id, reason: "Uyğunsuz şərh" });
      notify("Şikayət göndərildi");
    } catch (err) {
      notify(err?.response?.data?.message || "Şikayət göndərilmədi", true);
    }
  }

  async function drop(comment) {
    if (!remove) return;
    await remove(comment);
    const source = Array.isArray(comments) ? comments : [];
    const gone = new Set([comment.id]);
    let grew = true;
    while (grew) {
      grew = false;
      source.forEach((row) => {
        if (row.parentId && gone.has(row.parentId) && !gone.has(row.id)) {
          gone.add(row.id);
          grew = true;
        }
      });
    }
    onChange?.(source.filter((row) => !gone.has(row.id)));
    notify("Şərh silindi");
  }

  return (
    <div className="comment-panel">
      <div className="comment-panel-list">
        {list.length === 0 ? (
          <p className="muted">Hələ şərh yoxdur</p>
        ) : list.map((c) => (
          <div key={c.id} className={`comment-row${c.depth ? " is-reply" : ""}`} style={c.depth > 1 ? { paddingLeft: 28 + (c.depth - 1) * 16 } : undefined}>
            <Avatar src={c.user?.avatar} alt={c.user?.username} />
            <div>
              <p>
                <Link to={`/profile/${c.user?.username}`}><strong>@{c.user?.username}</strong></Link>
                {" "}{c.text}
              </p>
              <div className="comment-row-actions">
                <button type="button" onClick={() => { setParent(c); inputRef.current?.focus(); }}>Cavab</button>
                {me?.id === c.userId && edit ? (
                  <button type="button" onClick={() => { setEditingId(c.id); setEditing(c.text); }}>Düzəlt</button>
                ) : null}
                {me?.id === c.userId && remove ? (
                  <button type="button" onClick={() => drop(c)}>Sil</button>
                ) : null}
                {me?.id && me.id !== c.userId ? (
                  <button type="button" onClick={() => reportComment(c)}>Şikayət</button>
                ) : null}
              </div>
              {react ? (
                <div className="comment-reacts">
                  {reactingId === c.id ? (
                    <div className="comment-react-picker">
                      {REACTIONS.map((item) => (
                        <button key={item.type} type="button" className={c.myReaction === item.type ? "is-on" : ""} title={item.label} onClick={() => { reactTo(c, item.type); setReactingId(""); }}>
                          {item.emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" className="comment-react-main" onClick={() => setReactingId(reactingId === c.id ? "" : c.id)}>
                    {REACTIONS.find((item) => item.type === c.myReaction)?.emoji || "👍"}
                  </button>
                  <span className="muted">{c.reactionCount || c.likeCount || 0}</span>
                  {(c.reactions || []).filter((g) => g.count > 0).map((g) => (
                    <span key={g.type} className="muted">
                      {REACTIONS.find((item) => item.type === g.type)?.emoji} {(g.users || []).map((u) => u.username).join(", ")}
                    </span>
                  ))}
                </div>
              ) : null}
              {editingId === c.id ? (
                <div className="comment-row-actions">
                  <input value={editing} onChange={(e) => setEditing(e.target.value)} />
                  <button type="button" onClick={() => saveEdit(c)}>Saxla</button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form className="comment-compose" onSubmit={send}>
        {parent ? (
          <p className="comment-replying">
            <span>@{parent.user?.username} şərhinə cavab</span>
            <button type="button" onClick={() => setParent(null)}>Ləğv et</button>
          </p>
        ) : null}
        {emojiOpen ? <ExpressionPicker tabs={["emoji", "sticker", "music", "location"]} onPick={applyExpression} /> : null}
        <div className="comment-compose-row">
          <button type="button" className="emoji-toggle" onClick={() => setEmojiOpen((open) => !open)} aria-label="Emoji və digər">😊</button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={parent ? "Cavab yaz..." : "Şərh yaz..."}
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>Göndər</button>
        </div>
      </form>
    </div>
  );
}
