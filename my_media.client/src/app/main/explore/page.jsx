import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import Avatar from "../../../components/ui/Avatar";
import Icon from "../../../components/ui/Icon";

function asVideos(posts, reels) {
  const clips = [
    ...(Array.isArray(posts) ? posts : [])
      .filter((p) => p.media?.[0]?.type === "video" && p.media[0].url)
      .map((p) => ({
        id: p.id,
        user: p.user,
        url: p.media[0].url,
        caption: p.caption || "",
        createdAt: p.createdAt,
      })),
    ...(Array.isArray(reels) ? reels : [])
      .filter((r) => r.videoUrl)
      .map((r) => ({
        id: r.id,
        user: r.user,
        url: r.videoUrl,
        caption: r.caption || "",
        createdAt: r.createdAt,
      })),
  ];
  return clips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export default function ExplorePage() {
  const me = useAuthStore((s) => s.user);
  const [clips, setClips] = useState([]);
  const [followed, setFollowed] = useState([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("following");
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const touch = useRef(null);

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
      setFollowed((Array.isArray(people) ? people : []).map((p) => p.id));
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
    return clips.filter((clip) => ids.has(clip.user?.id));
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
    const el = box.current;
    if (!el || active >= shown.length - 1) return;
    el.scrollTo({ top: (active + 1) * el.clientHeight, behavior: "smooth" });
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
          Təqib etdiklərin
        </button>
        <button type="button" className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>
          Ümumi kəşf et
        </button>
      </div>
      <div className="discover-page" ref={box} onScroll={onScroll}>
        {!ready ? <p className="muted discover-empty">Yüklənir</p> : shown.length === 0 ? (
          <p className="muted discover-empty">
            {mode === "following" ? "Təqib etdiyin insanların videosu yoxdur" : "Hələ video yoxdur"}
          </p>
        ) : shown.map((item, i) => (
          <article key={item.id} className="discover-slide">
            <div className="discover-frame">
              <video src={item.url} muted={i !== active} loop playsInline autoPlay={i === active} />
              {i < shown.length - 1 ? (
                <button type="button" className="discover-down" onClick={goNext} aria-label="Növbəti video">
                  <Icon name="down" size={22} />
                </button>
              ) : null}
              <div className="discover-copy">
                <Link to={`/profile/${item.user?.username}`}>
                  <Avatar src={item.user?.avatar} alt={item.user?.username} />
                  <strong>@{item.user?.username}</strong>
                </Link>
                {item.caption ? <p>{item.caption}</p> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
