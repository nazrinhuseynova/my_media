import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../services/api";
import { useDebounce } from "../../../hooks/useDebounce";
import Avatar from "../../../components/ui/Avatar";
import Icon from "../../../components/ui/Icon";

function mixFeed(posts, reels) {
  const cards = [
    ...(Array.isArray(posts) ? posts : []).map((p) => ({ ...p, kind: "post" })),
    ...(Array.isArray(reels) ? reels : []).map((r) => ({
      id: r.id,
      kind: "reel",
      createdAt: r.createdAt,
      caption: r.caption || "",
      user: r.user,
      media: [{ type: "video", url: r.videoUrl }],
    })),
  ];
  return cards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 300);
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/api/explore").catch(() => ({ items: [] })),
      api.get("/api/reels").catch(() => []),
    ]).then(([explore, reels]) => setItems(mixFeed(explore?.items, reels))).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const text = debounced.trim();
    if (!text) {
      setUsers([]);
      return;
    }
    api.get("/api/search", { params: { q: text, type: "user" } })
      .then((data) => setUsers(data?.users || []))
      .catch(() => setUsers([]));
  }, [debounced]);

  const shown = useMemo(() => {
    const text = debounced.trim().toLowerCase();
    if (!text) return items;
    return items.filter((item) => {
      const caption = String(item.caption || "").toLowerCase();
      const name = String(item.user?.username || "").toLowerCase();
      const tags = (item.hashtags || []).join(" ").toLowerCase();
      return caption.includes(text) || name.includes(text) || tags.includes(text);
    });
  }, [items, debounced]);

  return (
    <div className="page search-page">
      <label className="explore-search">
        <Icon name="search" size={18} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İnsan, yazı və ya video axtar"
          type="search"
          autoComplete="off"
        />
      </label>

      {users.length ? (
        <div className="search-people">
          {users.map((u) => (
            <Link key={u.id} to={`/profile/${u.username}`} className="explore-hit">
              <Avatar src={u.avatar} alt={u.username} />
              <span>
                <strong>@{u.username}</strong>
                <span className="muted">{u.fullName}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {!ready ? <p className="muted">Yüklənir</p> : shown.length === 0 ? <p className="muted">Nəticə yoxdur</p> : (
        <div className="explore-mosaic">
          {shown.map((item) => {
            const media = item.media?.[0];
            const video = media?.type === "video";
            const href = item.kind === "post" ? `/p/${item.id}` : `/reels?v=${item.id}`;
            return (
              <Link key={`${item.kind}-${item.id}`} to={href} className="explore-tile">
                {video ? (
                  <video src={media.url} muted playsInline />
                ) : media?.url ? (
                  <img src={media.url} alt="" />
                ) : (
                  <span className="explore-tile-text">{item.poll?.question || item.caption || "Yazı"}</span>
                )}
                {video ? <span className="explore-tile-badge">Video</span> : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
