import { Link } from "react-router-dom";
import { isFuture } from "../../../utils/formatDate";
import { postHref } from "../../../utils/postHref";

export default function ProfileGrid({ posts }) {
  return (
    <div className="profile-grid">
      {posts.map((p) => (
        <Link key={p.id} to={postHref(p)} className="profile-tile">
          {p.media?.[0]?.url ? (
            p.media[0].type === "video" ? <video src={p.media[0].url} muted preload="none" /> : <img src={p.media[0].url} alt="" loading="lazy" />
          ) : (
            <span className="profile-tile-text">{p.poll?.question || p.caption || "Yazı"}</span>
          )}
          {isFuture(p.scheduledAt) ? <span className="profile-plan">Planlanıb</span> : null}
          {p.isPinned ? <span className="profile-plan is-pin">Sabit</span> : null}
        </Link>
      ))}
    </div>
  );
}
