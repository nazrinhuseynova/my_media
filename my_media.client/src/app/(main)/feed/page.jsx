import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../services/api";
import { postApi } from "../../../features/post/services/postApi";
import Avatar from "../../../components/ui/Avatar";
import Icon from "../../../components/ui/Icon";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import { useAppStore } from "../../../stores/useAppStore";
import { usePostStore } from "../../../features/post/store/usePostStore";
import PostCard from "../../../features/post/components/PostCard";
import StoryBar from "../../../features/story/components/StoryBar";
import LiveRail from "../../../features/live/LiveRail";
import { useIntersection } from "../../../hooks/useIntersection";
import { notify } from "../../../stores/useNoticeStore";
import { FeedSkeleton } from "../../../components/ui/Skeleton";

function SuggestRail({ people, onFollow }) {
  const row = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  function measure() {
    const el = row.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({
      left: el.scrollLeft > 6,
      right: max > 6 && el.scrollLeft < max - 6,
    });
  }

  useEffect(() => {
    measure();
    const el = row.current;
    const watch = new ResizeObserver(measure);
    if (el) watch.observe(el);
    return () => watch.disconnect();
  }, [people]);

  function move(dir) {
    const el = row.current;
    if (!el) return;
    el.scrollBy({ left: dir * 140, behavior: "smooth" });
  }

  return (
    <section className="suggest-block" data-tour="suggestions">
      <div className="feed-pad">
        <h2 className="feed-kicker">Təkliflər</h2>
        <h3>Tanış ola bilərsən</h3>
        <p className="muted suggest-lead">İzlə düyməsi bu insanı sənin lentinə əlavə edir.</p>
      </div>
      <div className="suggest-rail">
        <div className="suggest-slot">
          {edge.left ? (
            <button type="button" className="suggest-nav" onClick={() => move(-1)} aria-label="Sola">
              <Icon name="back" size={18} />
            </button>
          ) : null}
        </div>
        <div className="suggest-row" ref={row} onScroll={measure}>
          {people.map((person) => (
            <article key={person.id} className="suggest-card">
              <Link to={`/profile/${person.username}`}>
                <Avatar src={person.avatar} alt={person.fullName || person.username} />
                <strong>{person.fullName || person.username}</strong>
                <span>@{person.username}</span>
              </Link>
              <button type="button" onClick={() => onFollow(person)}>İzlə</button>
            </article>
          ))}
        </div>
        <div className="suggest-slot">
          {edge.right ? (
            <button type="button" className="suggest-nav" onClick={() => move(1)} aria-label="Sağa">
              <Icon name="next" size={18} />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function FeedPage() {
  const me = useAuthStore((s) => s.user);
  const setCreateOpen = useAppStore((s) => s.setCreateOpen);
  const { items, page, hasMore, setFeed, appendFeed, updatePost } = usePostStore();
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState(items.length ? "ready" : "loading");
  const [error, setError] = useState("");
  const [people, setPeople] = useState([]);
  const [startY, setStartY] = useState(0);
  const loadingRef = useRef(false);
  const pageRef = useRef(page);
  pageRef.current = page;

  const load = useCallback(async (nextPage, replace) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (replace) setStatus("loading");
    setError("");
    try {
      const data = await postApi.feed(nextPage);
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      const more = Boolean(data?.hasMore);
      if (replace) setFeed(nextItems, more, nextPage);
      else appendFeed(nextItems, more, nextPage);
      setStatus("ready");
    } catch (e) {
      const message = e?.response?.data?.message || "Lent yüklənmədi";
      if (replace) {
        setFeed([], false, 1);
        setStatus("error");
      }
      setError(message);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }, [appendFeed, setFeed]);

  useEffect(() => {
    load(1, true);
    api.get("/api/suggestions").then((list) => {
      const rows = Array.isArray(list) ? list : [];
      setPeople(rows.filter((person) => person?.id && person.username));
    }).catch(() => setPeople([]));
  }, [load]);

  const sentinel = useIntersection(useCallback(() => {
    if (status !== "ready" || loadingRef.current || !hasMore) return;
    load(pageRef.current + 1, false);
  }, [hasMore, load, page, status]));

  return (
    <div
      className="page feed-page"
      onTouchStart={(e) => setStartY(e.touches[0].clientY)}
      onTouchEnd={async (e) => {
        if (e.changedTouches[0].clientY - startY > 80) {
          setRefreshing(true);
          await load(1, true);
          setRefreshing(false);
        }
      }}
    >
      {refreshing ? <p className="muted feed-pad">Yenilənir...</p> : null}
      <header className="feed-head feed-pad">
        <h1>Ana səhifə</h1>
        <p className="muted">İzlədiyin insanların paylaşımları burada görünür.</p>
      </header>
      <button type="button" className="composer" data-tour="composer" onClick={() => setCreateOpen(true)}>
        <Avatar src={me?.avatar} alt={me?.username || ""} />
        <span>Nə paylaşmaq istəyirsən?</span>
      </button>
      <section className="feed-pad">
        <h2 className="feed-kicker">Hekayələr</h2>
      </section>
      <StoryBar />
      <LiveRail />
      {people.length ? (
        <SuggestRail
          people={people}
          onFollow={async (person) => {
            try {
              await api.post(`/api/users/${person.id}/follow`);
              setPeople((list) => list.filter((item) => item.id !== person.id));
              notify(person.isPrivate ? "İzləmə sorğusu göndərildi" : "İzlədin");
            } catch {
              setPeople((list) => list);
            }
          }}
        />
      ) : null}
      {status === "loading" && !items.length ? <FeedSkeleton /> : null}
      {status === "error" ? (
        <div className="feed-note feed-pad">
          <p className="error-text">{error || "Lent yüklənmədi"}</p>
          <button type="button" className="feed-retry" onClick={() => load(1, true)}>Yenidən yüklə</button>
        </div>
      ) : null}
      {status === "ready" && !items.length ? (
        <p className="muted feed-note">İzlədiyin insanlardan hələ paylaşım yoxdur.</p>
      ) : null}
      {items.map((post) => (
        <PostCard key={post.id} post={post} onChange={(p) => updatePost(p.id, p)} />
      ))}
      <div ref={sentinel} style={{ height: 40 }} />
      {error && status === "ready" ? <p className="error-text" style={{ textAlign: "center" }}>{error}</p> : null}
      {status === "ready" && items.length > 0 && !hasMore ? <p className="muted" style={{ textAlign: "center" }}>Hamısı yükləndi</p> : null}
    </div>
  );
}
