import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../services/api";
import { useAppStore } from "../../../stores/useAppStore";
import { formatCount } from "../../../utils/formatDate";
import { resolveMusic, mediaSrc } from "../../../utils/upload";
import Icon from "../../../components/ui/Icon";
import { notify } from "../../../stores/useNoticeStore";

export default function ReelPlayer({ reel, active }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [item, setItem] = useState(reel);
  const setShareTarget = useAppStore((s) => s.setShareTarget);
  const music = resolveMusic(item.music);

  useEffect(() => {
    setItem(reel);
  }, [reel]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) v.play().catch(() => {});
    else {
      v.pause();
      v.currentTime = 0;
    }
    const a = audioRef.current;
    if (a) {
      if (active && music.url) a.play().catch(() => {});
      else a.pause();
    }
  }, [active, music.url]);

  const [picker, setPicker] = useState(false);
  const faces = [
    ["like", "👍"], ["celebrate", "👏"], ["support", "🫶"], ["love", "❤️"], ["insightful", "💡"], ["funny", "😄"],
  ];

  async function react(type) {
    try {
      const res = await api.post(`/api/reels/${item.id}/react`, { reaction: type });
      setItem({ ...item, ...res });
      setPicker(false);
    } catch {
    }
  }

  return (
    <div className="reel-card">
      <video
        ref={videoRef}
        src={mediaSrc(item.videoUrl)}
        className={`filter-${item.effect || "none"}`}
        loop
        muted={!!music.url}
        playsInline
      />
      {music.url ? <audio ref={audioRef} src={music.url} loop /> : null}
      <div className="reel-meta">
        <Link to={`/profile/${item.user?.username}`}><strong>@{item.user?.username}</strong></Link>
        <p>{item.caption}</p>
        {music.name ? <p className="muted">♪ {music.name}</p> : null}
      </div>
      <div className="reel-side">
        <div className="reel-react">
          {picker ? faces.map(([type, emoji]) => (
            <button key={type} type="button" onClick={() => react(type)}>{emoji}</button>
          )) : null}
          <button type="button" onClick={() => setPicker((v) => !v)}>
            <span className="reel-face">{faces.find(([type]) => type === item.myReaction)?.[1] || "👍"}</span>
            <span>{formatCount(item.reactionCount || item.likeCount || 0)}</span>
          </button>
          {(item.reactions || []).filter((g) => g.count > 0).map((g) => (
            <span key={g.type} className="muted reel-who">
              {faces.find(([type]) => type === g.type)?.[1]} {(g.users || []).map((u) => u.username).join(", ")}
            </span>
          ))}
        </div>
        <button type="button" className="reel-side-comment" onClick={() => document.querySelector(".reels-comments")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>
          <Icon name="comment" size={26} />
          <span>{formatCount(item.commentCount || 0)}</span>
        </button>
        <button
          type="button"
          aria-label="Saxla"
          onClick={async () => {
            const res = await api.post(`/api/reels/${item.id}/save`);
            setItem((row) => ({ ...(row || item), saved: res.saved }));
          }}
        >
          <Icon name="bookmark" filled={!!item.saved} size={26} />
        </button>
        <button
          type="button"
          onClick={() => setShareTarget({ ...item, kind: "reel", videoUrl: item.videoUrl, media: [{ type: "video", url: item.videoUrl }], caption: item.caption })}
        >
          <Icon name="share" size={24} />
        </button>
        <button
          type="button"
          aria-label="Şikayət"
          onClick={async () => {
            try {
              await api.post("/api/reports", { targetType: "reel", targetId: item.id, reason: "Uyğunsuz reel" });
              notify("Şikayət göndərildi");
            } catch (err) {
              notify(err?.response?.data?.message || "Şikayət göndərilmədi", true);
            }
          }}
        >
          <Icon name="more" size={24} />
        </button>
      </div>
    </div>
  );
}
