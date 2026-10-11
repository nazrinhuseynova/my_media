import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import { useStoryStore } from "../../../features/story/store/useStoryStore";
import { useAppStore } from "../../../stores/useAppStore";
import StoryViewer from "../../../features/story/components/StoryViewer";
import Avatar from "../../../components/ui/Avatar";
import Icon from "../../../components/ui/Icon";
import CommentThread from "../../../features/comment/CommentThread";
import { formatCount } from "../../../utils/formatDate";

function readCaption(caption, location) {
  const raw = String(caption || "").trim();
  const tags = [...new Set([...raw.matchAll(/#([^\s#]+)/g)].map((m) => m[1].toLowerCase()))];
  const lines = raw
    .split(/\n/)
    .map((line) => line.replace(/#[^\s#]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const plain = raw.replace(/#[^\s#]+/g, " ").replace(/\s+/g, " ").trim();
  return {
    title: lines[0] || plain,
    subtitle: lines[1] || (location ? String(location) : ""),
    tags,
  };
}

function asVideos(posts, reels) {
  const clips = [
    ...(Array.isArray(posts) ? posts : [])
      .filter((p) => p.media?.[0]?.type === "video" && p.media[0].url)
      .map((p) => ({
        id: p.id,
        kind: "post",
        user: p.user,
        userId: p.userId || p.user?.id,
        url: p.media[0].url,
        caption: p.caption || "",
        location: p.location || "",
        createdAt: p.createdAt,
        likeCount: p.likeCount || 0,
        reactionCount: p.reactionCount || p.likeCount || 0,
        commentCount: p.commentCount || 0,
        saved: !!p.saved,
        myReaction: p.myReaction || "",
      })),
    ...(Array.isArray(reels) ? reels : [])
      .filter((r) => r.videoUrl)
      .map((r) => ({
        id: r.id,
        kind: "reel",
        user: r.user,
        userId: r.userId || r.user?.id,
        url: r.videoUrl,
        caption: r.caption || "",
        location: r.location || "",
        createdAt: r.createdAt,
        likeCount: r.likeCount || 0,
        reactionCount: r.reactionCount || r.likeCount || 0,
        commentCount: r.commentCount || 0,
        saved: !!r.saved,
        myReaction: r.myReaction || "",
      })),
  ];
  return clips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const groups = useStoryStore((s) => s.groups);
  const loadStories = useStoryStore((s) => s.load);
  const setShareTarget = useAppStore((s) => s.setShareTarget);
  const [storyIndex, setStoryIndex] = useState(-1);
  const [talk, setTalk] = useState(null);
  const [comments, setComments] = useState([]);
  const [clips, setClips] = useState([]);
  const [followed, setFollowed] = useState([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("following");
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const slides = useRef([]);
  const touch = useRef(null);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get("/api/explore").catch(() => ({ items: [] })),
      api.get("/api/reels").catch(() => []),
      me?.username
        ? api.get(`/api/users/${me.username}/following`).catch(() => [])
        : Promise.resolve([]),
    ]).then(([explore, reels, people]) => {
      if (!alive) return;
      setClips(asVideos(explore?.items, reels));
      setFollowed((Array.isArray(people) ? people : []).map((p) => String(p.id || "").toLowerCase()).filter(Boolean));
    }).finally(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [me?.username]);

  const shown = useMemo(() => {
    if (mode === "all") return clips;
    const ids = new Set(followed);
    return clips.filter((clip) => ids.has(String(clip.userId || clip.user?.id || "").toLowerCase()));
  }, [clips, followed, mode]);

  useEffect(() => {
    setActive(0);
    if (box.current) box.current.scrollTop = 0;
  }, [mode]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    setActive(Math.round(el.scrollTop / Math.max(el.clientHeight, 1)));
  }

  function goNext() {
    if (shown.length < 2) return;
    const target = active >= shown.length - 1 ? 0 : active + 1;
    const next = slides.current[target];
    if (!next) return;
    next.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function patch(id, partial) {
    setClips((rows) => rows.map((row) => (row.id === id ? { ...row, ...partial } : row)));
  }

  function apiBase(item) {
    return item.kind === "post" ? `/api/posts/${item.id}` : `/api/reels/${item.id}`;
  }

  async function toggleLike(item) {
    try {
      const res = await api.post(`${apiBase(item)}/react`, { reaction: "like" });
      patch(item.id, {
        myReaction: res.myReaction || "",
        reactionCount: res.reactionCount ?? res.likeCount ?? 0,
        likeCount: res.likeCount ?? res.reactionCount ?? 0,
      });
    } catch {
    }
  }

  async function toggleSave(item) {
    try {
      const res = await api.post(`${apiBase(item)}/save`);
      patch(item.id, { saved: !!res.saved });
    } catch {
    }
  }

  function shareClip(item) {
    setShareTarget({
      id: item.id,
      user: item.user,
      caption: item.caption,
      videoUrl: item.url,
      media: [{ type: "video", url: item.url }],
    });
  }

  function openComments(item) {
    setTalk(item);
    setComments([]);
    api.get(`${apiBase(item)}/comments`).then((list) => setComments(Array.isArray(list) ? list : [])).catch(() => setComments([]));
  }

  function syncComments(next) {
    setComments(next);
    if (talk) patch(talk.id, { commentCount: next.length });
  }

  function openStory(user) {
    const index = groups.findIndex((g) => g.user?.id === user?.id || g.user?.username === user?.username);
    if (index >= 0) {
      setStoryIndex(index);
      return;
    }
    if (user?.username) navigate(`/profile/${user.username}`);
  }

  function onTouchStart(e) {
    const t = e.changedTouches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e) {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy)) return;
    setMode(dx < 0 ? "all" : "following");
  }

  return (
    <div className="discover-shell" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="discover-tabs">
        <button type="button" className={mode === "following" ? "on" : ""} onClick={() => setMode("following")}>
          İzlədiklərin
        </button>
        <button type="button" className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>
          Ümumi kəşf et
        </button>
      </div>
      <div className="discover-page" ref={box} onScroll={onScroll}>
        {!ready ? <p className="muted discover-empty">Yüklənir</p> : shown.length === 0 ? (
          <p className="muted discover-empty">
            {mode === "following" ? "İzlədiyin insanların videosu hələ yoxdur" : "Hələ video yoxdur"}
          </p>
        ) : shown.map((item, i) => {
          const text = readCaption(item.caption, item.location);
          const hasStory = groups.some((g) => g.user?.id === item.user?.id || g.user?.username === item.user?.username);
          return (
          <article
            key={item.id}
            className="discover-slide"
            ref={(node) => {
              slides.current[i] = node;
            }}
          >
            <div className="discover-frame">
              <video src={item.url} muted={i !== active} loop playsInline autoPlay={i === active} />
              <button type="button" className="discover-profile" onClick={() => openStory(item.user)}>
                <span className={hasStory ? "discover-ring" : "discover-ring is-plain"}>
                  <Avatar src={item.user?.avatar} alt={item.user?.username} />
                </span>
                <span>
                  <strong>{item.user?.fullName || item.user?.username}</strong>
                  <small>@{item.user?.username}</small>
                </span>
              </button>
              <button type="button" className="discover-down" onClick={goNext} aria-label="Növbəti video">
                <Icon name="down" size={28} />
              </button>
              <div className="discover-actions">
                <button type="button" onClick={() => toggleLike(item)} aria-label="Bəyən">
                  <Icon name="heart" filled={!!item.myReaction} size={40} />
                  <span>{formatCount(item.reactionCount || item.likeCount || 0)}</span>
                  <small>Bəyən</small>
                </button>
                <button type="button" onClick={() => openComments(item)} aria-label="Şərh">
                  <Icon name="comment" size={40} />
                  <span>{formatCount(item.commentCount || 0)}</span>
                  <small>Şərh</small>
                </button>
                <button type="button" onClick={() => toggleSave(item)} aria-label="Saxla">
                  <Icon name="bookmark" filled={!!item.saved} size={40} />
                  <small>{item.saved ? "Saxlanılıb" : "Saxla"}</small>
                </button>
                <button type="button" onClick={() => shareClip(item)} aria-label="Paylaş">
                  <Icon name="share" size={36} />
                  <small>Paylaş</small>
                </button>
              </div>
              <div className="discover-bottom">
                {text.title ? <p className="discover-title">{text.title}</p> : null}
                {text.subtitle ? <p className="discover-sub">{text.subtitle}</p> : null}
                {text.tags.length ? (
                  <p className="discover-tags">{text.tags.map((tag) => `#${tag}`).join("  ")}</p>
                ) : null}
              </div>
            </div>
          </article>
          );
        })}
      </div>
      {talk ? (
        <aside className="discover-comments">
          <div className="discover-comments-head">
            <h3>Şərhlər ({comments.length})</h3>
            <button type="button" onClick={() => setTalk(null)} aria-label="Bağla">✕</button>
          </div>
          <CommentThread
            comments={comments}
            onChange={syncComments}
            submit={({ text, parentId }) => api.post(`${apiBase(talk)}/comments`, { text, parentId })}
            react={(comment, type) => api.post(talk.kind === "post" ? `/api/comments/${comment.id}/react` : `/api/reel-comments/${comment.id}/react`, { reaction: type })}
            edit={(comment, text) => api.patch(talk.kind === "post" ? `/api/comments/${comment.id}` : `/api/reel-comments/${comment.id}`, { text })}
            remove={(comment) => api.delete(talk.kind === "post" ? `/api/comments/${comment.id}` : `/api/reel-comments/${comment.id}`)}
          />
        </aside>
      ) : null}
      {storyIndex >= 0 ? (
        <StoryViewer
          groups={groups}
          startIndex={storyIndex}
          onClose={() => {
            setStoryIndex(-1);
            loadStories();
          }}
        />
      ) : null}
    </div>
  );
}
