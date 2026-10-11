import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "../../../components/ui/Avatar";
import { formatCount, formatDate, isFuture, asUtc } from "../../../utils/formatDate";
import { postApi } from "../services/postApi";
import { useAppStore } from "../../../stores/useAppStore";
import { useAuthStore } from "../../auth/store/useAuthStore";
import Icon from "../../../components/ui/Icon";
import Modal from "../../../components/ui/Modal";
import CommentPanel from "./CommentPanel";

const REACTIONS = [
  { type: "like", emoji: "👍", label: "Bəyəndim" },
  { type: "celebrate", emoji: "👏", label: "Təbrik" },
  { type: "support", emoji: "🫶", label: "Dəstək" },
  { type: "love", emoji: "❤️", label: "Sevgi" },
  { type: "insightful", emoji: "💡", label: "Maraqlı" },
  { type: "funny", emoji: "😄", label: "Gülməli" },
];

function reactionMeta(type) {
  return REACTIONS.find((item) => item.type === type) || REACTIONS[0];
}

function Caption({ text, username }) {
  const parts = String(text || "").split(/(\s+)/);
  return (
    <p>
      <Link to={`/profile/${username}`}><strong>{username}</strong></Link>
      {" "}
      {parts.map((part, i) => {
        if (part.startsWith("#") && part.length > 1) {
          const tag = part.slice(1).replace(/[^\wçğıöşüəÇĞIİÖŞÜƏ]/gi, "");
          return <Link key={i} to={`/hashtag/${tag.toLowerCase()}`}>{part}</Link>;
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export default function PostCard({ post, onChange, layout = "feed" }) {
  const me = useAuthStore((s) => s.user);
  const setShareTarget = useAppStore((s) => s.setShareTarget);
  const [index, setIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [reactionView, setReactionView] = useState(null);
  const [comments, setComments] = useState(post.comments || []);
  const mediaList = post.media || [];
  const media = mediaList[index];
  const detail = layout === "detail";
  const last = mediaList.length - 1;

  useEffect(() => {
    setIndex(0);
    setReactionView(null);
    setPicker(false);
  }, [post.id]);

  useEffect(() => {
    setComments(post.comments || []);
  }, [post.comments]);

  async function openComments() {
    if (detail) {
      document.getElementById("post-comments")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    setSheetOpen(true);
    try {
      const list = await postApi.comments(post.id);
      setComments(Array.isArray(list) ? list : []);
    } catch {
      const data = await postApi.one(post.id).catch(() => null);
      setComments(data?.comments || []);
    }
  }

  const shown = reactionView ? { ...post, ...reactionView } : post;
  const groups = shown.reactions || [];
  const mine = reactionMeta(shown.myReaction);
  const planned = isFuture(shown.scheduledAt);

  async function react(type) {
    try {
      const res = await postApi.react(post.id, type);
      setReactionView(res);
      onChange?.({ ...post, ...res });
      setPicker(false);
    } catch {
    }
  }

  async function vote(optionId) {
    try {
      const poll = await postApi.vote(post.id, optionId);
      const next = { ...shown, poll };
      setReactionView((view) => ({ ...(view || {}), poll }));
      onChange?.(next);
    } catch {
    }
  }

  async function save() {
    try {
      const res = await postApi.save(post.id);
      setReactionView((view) => ({ ...(view || {}), saved: res.saved }));
      onChange?.({ ...shown, saved: res.saved });
    } catch {
    }
  }

  return (
    <article className={`card post-card${detail ? " is-detail" : ""}`}>
      <div className="post-head">
        <Link to={`/profile/${post.user?.username}`} className="row">
          <Avatar src={post.user?.avatar} />
          <div className="post-id">
            <strong>{post.user?.fullName || post.user?.username}</strong>
            <div className="muted">@{post.user?.username}{post.location ? ` · ${post.location}` : ""}</div>
            {shown.isPinned ? <div className="muted">Sabitlənib</div> : null}
          </div>
        </Link>
        <span className="muted">
          {planned ? `Plan: ${asUtc(shown.scheduledAt).toLocaleString("az-AZ")}` : formatDate(post.createdAt)}
        </span>
      </div>
      {media?.url ? (
      <div className="post-media">
        {media.type === "video" ? (
          <video src={media.url} controls className={`filter-${media.filter || "none"}`} />
        ) : (
          <img src={media.url} alt="" className={`filter-${media.filter || "none"}`} />
        )}
        {mediaList.length > 1 ? (
          <>
            {index > 0 ? (
              <button type="button" className="post-nav is-prev" onClick={() => setIndex((i) => i - 1)}>‹</button>
            ) : null}
            {index < last ? (
              <button type="button" className="post-nav is-next" onClick={() => setIndex((i) => i + 1)}>›</button>
            ) : null}
          </>
        ) : null}
      </div>
      ) : null}
      {media?.url && mediaList.length > 1 ? (
        <div className="dots">
          {mediaList.map((m, i) => (
            <span key={(m.url || "") + i} className={i === index ? "on" : ""} />
          ))}
        </div>
      ) : null}
      <div className="post-meta">
        <Caption text={post.caption} username={post.user?.username} />
        {shown.tags?.length ? (
          <p className="muted">İşarə: {shown.tags.map((t) => `@${t.username}`).join(" ")}</p>
        ) : null}
        {shown.repost ? (
          <div className="repost-box">
            <strong>@{shown.repost.user?.username}</strong>
            <p>{shown.repost.caption}</p>
            {shown.repost.media?.[0]?.url ? <img src={shown.repost.media[0].url} alt="" /> : null}
          </div>
        ) : null}
        {shown.poll ? (
          <div className="poll-box">
            <strong>{shown.poll.question}</strong>
            {shown.poll.options.map((option) => (
              <button key={option.id} type="button" className={shown.poll.votedOptionId === option.id ? "is-on" : ""} onClick={() => vote(option.id)}>
                {option.text} · {option.count}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="react-summary" onClick={() => setPeopleOpen(true)}>
          <span className="react-faces">
            {groups.map((group) => (
              <span key={group.type}>{reactionMeta(group.type).emoji}</span>
            ))}
          </span>
          <span>{formatCount(shown.reactionCount || shown.likeCount || 0)} reaksiya</span>
        </button>
      </div>
      <div className="post-actions">
        <div className="react-wrap">
          {picker ? (
            <div className="react-picker">
              {REACTIONS.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className={shown.myReaction === item.type ? "is-on" : ""}
                  title={item.label}
                  onClick={() => react(item.type)}
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" className={`post-action${shown.myReaction ? " is-on" : ""}`} onClick={() => setPicker((open) => !open)}>
            <span aria-hidden="true">{shown.myReaction ? mine.emoji : "👍"}</span>
            <span>{shown.myReaction ? mine.label : "Bəyən"}</span>
          </button>
        </div>
        <button type="button" className="post-action" onClick={openComments}>
          <Icon name="comment" size={18} />
          <span>Şərh</span>
        </button>
        <button type="button" className="post-action" onClick={() => setShareTarget(post)}>
          <Icon name="share" size={18} />
          <span>Paylaş</span>
        </button>
        <button type="button" className={`post-action${shown.saved ? " is-on" : ""}`} onClick={save}>
          <Icon name="bookmark" size={18} filled={!!shown.saved} />
          <span>{shown.saved ? "Saxlanılıb" : "Saxla"}</span>
        </button>
      </div>
      <div className="post-meta">
        {!shown.repost && !planned ? (
          <button type="button" className="post-comments-link" onClick={async () => {
            if (!window.confirm("Bunu öz lentinə yenidən paylaşım?")) return;
            await postApi.repost(post.id, {});
            window.location.assign("/");
          }}>Yenidən paylaş</button>
        ) : null}
        <button type="button" className="post-comments-link" onClick={openComments}>
          {post.commentCount ? `${post.commentCount} şərh` : "Şərh yaz"}
        </button>
      </div>

      <Modal open={peopleOpen} onClose={() => setPeopleOpen(false)} title="Reaksiyalar">
        {groups.length ? groups.map((group) => {
          const meta = reactionMeta(group.type);
          return (
            <section key={group.type} className="react-group">
              <h4>{meta.emoji} {meta.label} · {group.count}</h4>
              {(group.users || []).map((person) => (
                <Link key={person.id} to={`/profile/${person.username}`} className="react-person" onClick={() => setPeopleOpen(false)}>
                  <Avatar src={person.avatar} alt={person.username} />
                  <span>
                    <strong>@{person.username}</strong>
                    {person.fullName ? <div className="muted">{person.fullName}</div> : null}
                  </span>
                </Link>
              ))}
            </section>
          );
        }) : <p className="muted">Hələ reaksiya yoxdur</p>}
      </Modal>

      {!detail ? (
        <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="Şərhlər" from="bottom">
          <CommentPanel
            postId={post.id}
            comments={comments}
            onChange={(next) => {
              setComments(next);
              onChange?.({ ...post, comments: next, commentCount: next.length });
            }}
          />
        </Modal>
      ) : null}
    </article>
  );
}
