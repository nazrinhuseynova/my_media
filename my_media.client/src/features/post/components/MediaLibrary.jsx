import { Link } from "react-router-dom";
import { mediaSrc } from "../../../utils/upload";
import { postHref } from "../../../utils/postHref";

export function toMediaTiles(posts, reels) {
  const postTiles = (posts || []).map((p) => ({
    key: `p-${p.id}`,
    to: postHref(p),
    url: p.media?.[0]?.url,
    video: p.media?.[0]?.type === "video",
  })).filter((t) => t.url);
  const reelTiles = (reels || []).map((r) => ({
    key: `r-${r.id}`,
    to: "/reels",
    url: r.videoUrl,
    video: true,
  })).filter((t) => t.url);
  return [...postTiles, ...reelTiles];
}

export default function MediaLibrary({ items }) {
  if (!items.length) return <p className="muted">Hələ heç nə yoxdur</p>;
  return (
    <div className="settings-mosaic">
      {items.map((item) => (
        <Link key={item.key} to={item.to} className="explore-tile">
          {item.video ? (
            <video src={mediaSrc(item.url)} muted playsInline preload="metadata" />
          ) : (
            <img src={mediaSrc(item.url)} alt="" />
          )}
          {item.video ? <span className="explore-tile-badge">Video</span> : null}
        </Link>
      ))}
    </div>
  );
}
