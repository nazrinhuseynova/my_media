import { useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";
import { resolveMusic } from "../../../utils/upload";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { useStoryStore } from "../store/useStoryStore";
import Icon from "../../../components/ui/Icon";
import { EmojiPad } from "../../comment/CommentThread";

export default function StoryViewer({ groups, startIndex, onClose }) {
  const me = useAuthStore((s) => s.user);
  const [gIdx, setGIdx] = useState(startIndex);
  const [index, setIndex] = useState(0);
  const [viewers, setViewers] = useState([]);
  const [reply, setReply] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const replyRef = useRef(null);
  const [replies, setReplies] = useState([]);
  const [note, setNote] = useState("");
  const startX = useRef(0);
  const group = groups[gIdx];
  const story = group?.stories?.[index];
  const music = resolveMusic(story?.music);
  const hasPrev = gIdx > 0;
  const hasNext = gIdx < groups.length - 1;

  useEffect(() => {
    if (!story) return;
    api.post(`/api/stories/${story.id}/view`).then((d) => {
      setViewers(d.viewers || []);
      if (group?.user?.id && group.user.id !== me?.id) useStoryStore.getState().markSeen(group.user.id);
    }).catch(() => setViewers([]));
    if (group?.user?.id === me?.id) {
      api.get(`/api/stories/${story.id}/replies`).then(setReplies).catch(() => setReplies([]));
    } else setReplies([]);
  }, [story, group?.user?.id, me?.id]);

  if (!group || !story) return null;

  function goNext() {
    if (index < group.stories.length - 1) {
      setIndex(index + 1);
      return;
    }
    if (hasNext) {
      setGIdx(gIdx + 1);
      setIndex(0);
    }
  }

  function goPrev() {
    if (index > 0) {
      setIndex(index - 1);
      return;
    }
    if (hasPrev) {
      const prev = groups[gIdx - 1];
      setGIdx(gIdx - 1);
      setIndex(Math.max(0, (prev.stories?.length || 1) - 1));
    }
  }

  function goNextUser(e) {
    e.stopPropagation();
    if (!hasNext) return;
    setGIdx(gIdx + 1);
    setIndex(0);
  }

  function goPrevUser(e) {
    e.stopPropagation();
    if (!hasPrev) return;
    setGIdx(gIdx - 1);
    setIndex(0);
  }

  function onPointerDown(e) {
    startX.current = e.clientX;
  }

  function onPointerUp(e) {
    const dx = e.clientX - startX.current;
    if (dx <= -56) {
      if (hasNext) {
        setGIdx(gIdx + 1);
        setIndex(0);
      }
      return;
    }
    if (dx >= 56) {
      if (hasPrev) {
        setGIdx(gIdx - 1);
        setIndex(0);
      }
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX < box.left + box.width * 0.4) goPrev();
    else if (e.clientX > box.right - box.width * 0.4) goNext();
  }

  return (
    <div className="story-viewer" onClick={onClose}>
      <div className="story-stage" onClick={(e) => e.stopPropagation()}>
      {hasPrev ? (
        <button
          type="button"
          className="story-nav story-nav-prev"
          aria-label="Əvvəlki hekayə"
          onClick={goPrevUser}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <Icon name="back" size={22} />
        </button>
      ) : null}
      <div
        className="story-frame"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div className="story-progress">
          {group.stories.map((s, i) => (
            <span key={s.id} className={i <= index ? "on" : ""} />
          ))}
        </div>
        {story.mediaType === "video" ? (
          <video className="story-media" src={story.mediaUrl} autoPlay playsInline />
        ) : (
          <img className="story-media" src={story.mediaUrl} alt="" draggable={false} />
        )}
        {story.text ? <div className="story-caption">{story.text}</div> : null}
        {story.sticker ? <div className="story-sticker">{story.sticker}</div> : null}
        {music.name ? <div className="muted story-music">♪ {music.name}</div> : null}
        {music.url ? <audio src={music.url} autoPlay loop /> : null}
        <div className="row space-between story-head">
          <div className="story-user">
            <img className="avatar story-head-avatar" src={group.user.avatar} alt="" />
            <strong>{group.user.username}</strong>
          </div>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <form className="story-reply" onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!reply.trim()) return;
          await api.post(`/api/stories/${story.id}/reply`, { text: reply.trim() });
          setReply("");
          setNote("Cavab getdi");
        }} onClick={(e) => e.stopPropagation()}>
          {emojiOpen ? (
            <EmojiPad onPick={(emoji) => {
              const el = replyRef.current;
              const start = el?.selectionStart ?? reply.length;
              const end = el?.selectionEnd ?? reply.length;
              const next = `${reply.slice(0, start)}${emoji}${reply.slice(end)}`;
              setReply(next);
              const pos = start + emoji.length;
              requestAnimationFrame(() => {
                el?.focus();
                el?.setSelectionRange(pos, pos);
              });
            }} />
          ) : null}
          <button type="button" className="emoji-toggle" aria-label="Emoji" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setEmojiOpen((open) => !open); }}>😊</button>
          <input ref={replyRef} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Cavab yaz" onPointerDown={(e) => e.stopPropagation()} />
          <button type="submit">Göndər</button>
        </form>
        {group.user.id === me.id ? (
          <button type="button" className="story-save" onClick={async (e) => {
            e.stopPropagation();
            const name = window.prompt("Seçilmişin adı", "Seçilmiş");
            if (!name) return;
            await api.post("/api/highlights", { name, mediaUrl: story.mediaUrl, mediaType: story.mediaType, text: story.text || "" });
            setNote("Seçilmişlərə yazıldı");
          }}>Seçilmişə yaz</button>
        ) : null}
        {note ? <p className="story-note">{note}</p> : null}
        {group.user.id === me.id ? (
          <div className="story-viewers">
            <p>Kim baxıb</p>
            {viewers.map((v) => (
              <div key={v.id}>{v.username}</div>
            ))}
            {replies.length ? <p>Cavablar</p> : null}
            {replies.map((r) => (
              <div key={r.id}>@{r.user?.username}: {r.text}</div>
            ))}
          </div>
        ) : null}
      </div>
      {hasNext ? (
        <button
          type="button"
          className="story-nav story-nav-next"
          aria-label="Növbəti hekayə"
          onClick={goNextUser}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <Icon name="next" size={22} />
        </button>
      ) : null}
      </div>
    </div>
  );
}
