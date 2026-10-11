import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../services/api";
import ReelPlayer from "../../../features/reels/components/ReelPlayer";
import { useAppStore } from "../../../stores/useAppStore";
import Button from "../../../components/ui/Button";
import Avatar from "../../../components/ui/Avatar";
import Icon from "../../../components/ui/Icon";

export default function ReelsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const setOpen = useAppStore((s) => s.setReelCreateOpen);
  const [params] = useSearchParams();
  const box = useRef(null);
  const reel = items[active];

  function goBack() {
    const idx = window.history.state?.idx;
    if (typeof idx === "number" && idx > 0) navigate(-1);
    else navigate("/");
  }

  useEffect(() => {
    api.get("/api/reels").then((list) => {
      const rows = Array.isArray(list) ? list : [];
      setItems(rows);
      const wanted = params.get("v");
      const idx = wanted ? rows.findIndex((r) => r.id === wanted) : -1;
      if (idx > 0) {
        setActive(idx);
        requestAnimationFrame(() => {
          const el = box.current;
          if (el) el.scrollTop = idx * el.clientHeight;
        });
      }
    });
  }, [params]);

  useEffect(() => {
    if (!reel?.id) {
      setComments([]);
      return;
    }
    api.get(`/api/reels/${reel.id}/comments`).then((list) => setComments(Array.isArray(list) ? list : [])).catch(() => setComments([]));
    setText("");
  }, [reel?.id]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    setActive(Math.round(el.scrollTop / Math.max(el.clientHeight, 1)));
  }

  async function sendComment(e) {
    e.preventDefault();
    if (!text.trim() || !reel) return;
    setBusy(true);
    try {
      const c = await api.post(`/api/reels/${reel.id}/comments`, { text: text.trim() });
      setComments((prev) => [...prev, c]);
      setItems((prev) => prev.map((r) => (r.id === reel.id ? { ...r, commentCount: (r.commentCount || 0) + 1 } : r)));
      setText("");
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page reels-shell">
      <div className="reels-head">
        <button type="button" className="reels-back" onClick={goBack} aria-label="Geri">
          <Icon name="back" size={22} />
          <span>Geri</span>
        </button>
        <h2>Reels</h2>
        <Button type="button" onClick={() => setOpen(true)}>Yeni reel</Button>
      </div>
      <div className="reels-wrap">
        <div className="reels-page" ref={box} onScroll={onScroll}>
          {items.length === 0 ? (
            <div className="reels-empty">Hələ reel yoxdur</div>
          ) : items.map((item, i) => (
            <div key={item.id} className="reels-slide">
              <ReelPlayer reel={item} active={i === active} />
            </div>
          ))}
        </div>
        <aside className="reels-comments">
          <h3>Şərhlər {reel ? `(${comments.length})` : ""}</h3>
          <div className="reels-comments-list">
            {!reel ? (
              <p className="muted">Reel yoxdur</p>
            ) : comments.length === 0 ? (
              <p className="muted">Hələ şərh yoxdur. Birinci sən yaz.</p>
            ) : comments.map((c) => (
              <div key={c.id} className="reels-comment">
                <Avatar src={c.user?.avatar} />
                <div>
                  <Link to={`/profile/${c.user?.username}`}><strong>@{c.user?.username}</strong></Link>
                  <p>{c.text}</p>
                </div>
              </div>
            ))}
          </div>
          {reel ? (
            <form className="reels-comment-form" onSubmit={sendComment}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Şərh yaz..." />
              <Button disabled={busy} type="submit">Göndər</Button>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
