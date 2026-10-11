import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../services/api";
import { postApi } from "../../../features/post/services/postApi";
import Avatar from "../../../components/ui/Avatar";
import Icon from "../../../components/ui/Icon";
import { usePostStore } from "../../../features/post/store/usePostStore";
import PostCard from "../../../features/post/components/PostCard";
import StoryBar from "../../../features/story/components/StoryBar";
import { useIntersection } from "../../../hooks/useIntersection";

function SuggestRail({ people }) {
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
    <section className="suggest-block">
      <h3>Tanış ola bilərsən</h3>
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
            <Link key={person.id} to={`/profile/${person.username}`} className="suggest-person">
              <Avatar src={person.avatar} alt={person.username} />
              <span>@{person.username}</span>
            </Link>
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
  const { items, page, hasMore, setFeed, appendFeed, updatePost } = usePostStore();
  const [refreshing, setRefreshing] = useState(false);
  const [people, setPeople] = useState([]);
  const [startY, setStartY] = useState(0);

  const load = useCallback(async (nextPage, replace) => {
    const data = await postApi.feed(nextPage);
    if (replace) setFeed(data.items, data.hasMore, nextPage);
    else appendFeed(data.items, data.hasMore, nextPage);
  }, [appendFeed, setFeed]);

  useEffect(() => {
    load(1, true);
    api.get("/api/suggestions").then(setPeople).catch(() => setPeople([]));
  }, [load]);

  const sentinel = useIntersection(() => {
    if (hasMore) load(page + 1, false);
  });

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
      {refreshing ? <p className="muted">Yenilənir...</p> : null}
      <StoryBar />
      {people.length ? <SuggestRail people={people} /> : null}
      {items.map((post) => (
        <PostCard key={post.id} post={post} onChange={(p) => updatePost(p.id, p)} />
      ))}
      <div ref={sentinel} style={{ height: 40 }} />
      {!hasMore ? <p className="muted" style={{ textAlign: "center" }}>Hamısı yükləndi</p> : null}
    </div>
  );
}
