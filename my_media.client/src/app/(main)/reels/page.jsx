import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../services/api";
import ReelPlayer from "../../../features/reels/components/ReelPlayer";
import CommentThread from "../../../features/comment/CommentThread";
import { useAppStore } from "../../../stores/useAppStore";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/ui/Icon";

export default function ReelsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [comments, setComments] = useState([]);
  const loadingMore = useRef(false);
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
    api.get("/api/reels", { params: { page: 1, pageSize: 8, focus: params.get("v") || undefined } }).then((list) => {
      const rows = Array.isArray(list) ? list : (list?.items || []);
      setItems(rows);
      setPage(list?.page || 1);
      setHasMore(!!list?.hasMore);
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
  }, [reel?.id]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    const index = Math.round(el.scrollTop / Math.max(el.clientHeight, 1));
    setActive(index);
    if (!hasMore || loadingMore.current || index < items.length - 2) return;
    loadingMore.current = true;
    api.get("/api/reels", { params: { page: page + 1, pageSize: 8 } })
      .then((list) => {
        const rows = Array.isArray(list) ? list : (list?.items || []);
        setItems((prev) => [...prev, ...rows.filter((row) => !prev.some((item) => item.id === row.id))]);
        setPage(list?.page || page + 1);
        setHasMore(!!list?.hasMore);
      })
      .finally(() => {
        loadingMore.current = false;
      });
  }

  function syncComments(next) {
    setComments(next);
    if (!reel) return;
    setItems((prev) => prev.map((row) => (row.id === reel.id ? { ...row, commentCount: next.length } : row)));
  }

  return (
    <div className="page reels-shell stage-lock">
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
          {reel ? (
            <CommentThread
              comments={comments}
              onChange={syncComments}
              submit={({ text, parentId }) => api.post(`/api/reels/${reel.id}/comments`, { text, parentId })}
              react={(comment, type) => api.post(`/api/reel-comments/${comment.id}/react`, { reaction: type })}
              edit={(comment, text) => api.patch(`/api/reel-comments/${comment.id}`, { text })}
              remove={(comment) => api.delete(`/api/reel-comments/${comment.id}`)}
            />
          ) : (
            <p className="muted">Reel yoxdur</p>
          )}
        </aside>
      </div>
    </div>
  );
}
