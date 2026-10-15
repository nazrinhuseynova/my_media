import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { postHref } from "../../../utils/postHref";
import { api } from "../../../services/api";
import { useDebounce } from "../../../hooks/useDebounce";
import Avatar from "../../../components/ui/Avatar";
import Icon from "../../../components/ui/Icon";
import AutoPlayVideo from "../../../components/ui/AutoPlayVideo";
import LoadingDots from "../../../components/ui/LoadingDots";

const RECENT_KEY = "pulse_search_recent";
const TABS = [
  { id: "all", label: "Sizin üçün" },
  { id: "users", label: "Hesablar" },
  { id: "posts", label: "Postlar" },
  { id: "tags", label: "Teqlər" },
  { id: "places", label: "Yerlər" },
];

function mixFeed(posts, reels) {
  const cards = [
    ...(Array.isArray(posts) ? posts : []).map((p) => ({ ...p, kind: "post" })),
    ...(Array.isArray(reels) ? reels : []).map((r) => ({
      id: r.id,
      kind: "reel",
      createdAt: r.createdAt,
      caption: r.caption || "",
      user: r.user,
      hashtags: [],
      location: "",
      media: [{ type: "video", url: r.videoUrl }],
    })),
  ];
  return cards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function loadRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function tagList(item) {
  return Array.isArray(item?.hashtags) ? item.hashtags : [];
}

function countTag(items, name) {
  const needle = String(name || "").replace(/^#/, "").toLowerCase();
  return items.filter((item) => tagList(item).some((tag) => String(tag).replace(/^#/, "").toLowerCase() === needle)).length;
}

function countPlace(items, name) {
  return items.filter((item) => String(item.location || "") === name).length;
}

function previewPeople(items) {
  const seen = new Set();
  const list = [];
  items.forEach((item) => {
    const user = item.user;
    if (!user?.username || seen.has(user.username)) return;
    seen.add(user.username);
    list.push(user);
  });
  return list;
}

function previewTags(items) {
  const map = new Map();
  items.forEach((item) => {
    tagList(item).forEach((raw) => {
      const name = String(raw).replace(/^#/, "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      const prev = map.get(key);
      map.set(key, { name: prev?.name || name, count: (prev?.count || 0) + 1 });
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function previewPlaces(items) {
  const map = new Map();
  items.forEach((item) => {
    const name = String(item.location || "").trim();
    if (!name) return;
    map.set(name, (map.get(name) || 0) + 1);
  });
  return [...map.entries()].map(([name, count]) => ({ name, count }));
}

function readTab(value) {
  return TABS.some((item) => item.id === value) ? value : "all";
}

function MosaicSkeleton() {
  return (
    <div className="explore-mosaic search-mosaic" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="skel skel-tile explore-tile" />
      ))}
    </div>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const tab = readTab(params.get("tab"));
  const debounced = useDebounce(q, 250);

  function setQ(value) {
    const next = new URLSearchParams(params);
    if (value) next.set("q", value);
    else next.delete("q");
    if (!next.get("tab")) next.set("tab", tab);
    setParams(next, { replace: true });
  }

  function setTab(value) {
    const next = new URLSearchParams(params);
    next.set("tab", readTab(value));
    if (q) next.set("q", q);
    else next.delete("q");
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (params.get("tab")) return;
    const next = new URLSearchParams(params);
    next.set("tab", "all");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const [users, setUsers] = useState([]);
  const [hashtags, setHashtags] = useState([]);
  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [postPage, setPostPage] = useState(1);
  const [reelPage, setReelPage] = useState(1);
  const [postMore, setPostMore] = useState(false);
  const [reelMore, setReelMore] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const busyRef = useRef(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api.get("/api/explore", { params: { page: 1, pageSize: 12 } }).catch(() => ({ items: [], hasMore: false })),
      api.get("/api/reels", { params: { page: 1, pageSize: 8 } }).catch(() => ({ items: [], hasMore: false })),
    ]).then(([explore, reels]) => {
      if (cancel) return;
      setItems(mixFeed(explore?.items, reels?.items || reels));
      setPostPage(1);
      setReelPage(1);
      setPostMore(!!explore?.hasMore);
      setReelMore(!!(reels?.hasMore));
    }).finally(() => {
      if (!cancel) setReady(true);
    });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const text = debounced.trim();
    if (!text) {
      setUsers([]);
      setHashtags([]);
      setLocations([]);
      setSearching(false);
      return undefined;
    }
    let cancel = false;
    setSearching(true);
    api.get("/api/search", { params: { q: text, page: 1, pageSize: 20 } })
      .then((data) => {
        if (cancel) return;
        setUsers(data?.users || []);
        setHashtags(data?.hashtags || []);
        setLocations(data?.locations || []);
      })
      .catch(() => {
        if (cancel) return;
        setUsers([]);
        setHashtags([]);
        setLocations([]);
      })
      .finally(() => {
        if (!cancel) setSearching(false);
      });
    return () => { cancel = true; };
  }, [debounced]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const loadMore = useCallback(async () => {
    if (busyRef.current || (!postMore && !reelMore) || open) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const jobs = [];
      if (postMore) {
        jobs.push(
          api.get("/api/explore", { params: { page: postPage + 1, pageSize: 12 } })
            .then((data) => ({ kind: "post", data }))
            .catch(() => ({ kind: "post", data: { items: [], hasMore: false } }))
        );
      }
      if (reelMore) {
        jobs.push(
          api.get("/api/reels", { params: { page: reelPage + 1, pageSize: 8 } })
            .then((data) => ({ kind: "reel", data }))
            .catch(() => ({ kind: "reel", data: { items: [], hasMore: false } }))
        );
      }
      const results = await Promise.all(jobs);
      let nextPosts = [];
      let nextReels = [];
      results.forEach((entry) => {
        if (entry.kind === "post") {
          nextPosts = entry.data?.items || [];
          setPostPage((p) => p + 1);
          setPostMore(!!entry.data?.hasMore);
        } else {
          nextReels = entry.data?.items || entry.data || [];
          if (!Array.isArray(nextReels)) nextReels = entry.data?.items || [];
          setReelPage((p) => p + 1);
          setReelMore(!!entry.data?.hasMore);
        }
      });
      const mixed = mixFeed(nextPosts, nextReels);
      if (mixed.length) {
        setItems((prev) => {
          const seen = new Set(prev.map((x) => `${x.kind}-${x.id}`));
          return [...prev, ...mixed.filter((x) => !seen.has(`${x.kind}-${x.id}`))];
        });
      }
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [open, postMore, reelMore, postPage, reelPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !ready) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, ready]);

  const queryOn = debounced.trim().length > 0;
  const posts = useMemo(() => {
    const text = debounced.trim().toLowerCase();
    if (!text) return items;
    return items.filter((item) => {
      const caption = String(item.caption || item.poll?.question || "").toLowerCase();
      const name = String(item.user?.username || "").toLowerCase();
      const full = String(item.user?.fullName || "").toLowerCase();
      const tags = tagList(item).join(" ").toLowerCase();
      const place = String(item.location || "").toLowerCase();
      return caption.includes(text) || name.includes(text) || full.includes(text) || tags.includes(text) || place.includes(text);
    });
  }, [items, debounced]);

  const people = queryOn ? users : previewPeople(items);
  const tags = queryOn
    ? hashtags.map((name) => ({ name: String(name).replace(/^#/, ""), count: countTag(items, name) }))
    : previewTags(items);
  const places = queryOn
    ? locations.map((name) => ({ name, count: countPlace(items, name) }))
    : previewPlaces(items);

  function persist(next) {
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  function remember(entry) {
    persist([entry, ...recent.filter((item) => item.key !== entry.key)].slice(0, 10));
  }

  function forget(key) {
    persist(recent.filter((item) => item.key !== key));
  }

  function show(id) {
    return tab === "all" || tab === id;
  }

  const limit = tab === "all" ? 4 : 40;
  const visiblePeople = people.slice(0, limit);
  const visiblePosts = (queryOn ? posts : items).slice(0, tab === "all" ? 6 : 12);
  const visibleTags = tags.slice(0, limit);
  const visiblePlaces = places.slice(0, limit);
  const nothing = queryOn && !searching && !people.length && !posts.length && !tags.length && !places.length;

  function pick(entry) {
    remember(entry);
    setOpen(false);
  }

  return (
    <div className="page search-page">
      <div className="search-top" ref={boxRef}>
        <label className="explore-search">
          <Icon name="search" size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="İnsan, yazı və ya video axtar"
            type="search"
            autoComplete="off"
            aria-label="Axtarış"
          />
          {q ? (
            <button type="button" className="ig-clear" aria-label="Axtarışı təmizlə" onClick={() => { setQ(""); setOpen(true); }}>
              ×
            </button>
          ) : null}
        </label>

        {open ? (
          <div className="search-pop" role="dialog" aria-label="Axtarış nəticələri">
            <div className="search-pop-bar">
              <strong>Axtarış</strong>
              <button type="button" className="ig-text-btn" onClick={() => setOpen(false)}>Bağla</button>
            </div>
            <div className="ig-tabs" role="tablist">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={tab === item.id ? "on" : ""}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="ig-search-scroll">
              {!queryOn && tab === "all" && recent.length ? (
                <section className="ig-block">
                  <div className="ig-sec">
                    <h2>Son axtarışlar</h2>
                    <button type="button" className="ig-text-btn" onClick={() => persist([])}>Hamısını sil</button>
                  </div>
                  {recent.map((item) => (
                    <div key={item.key} className="ig-recent">
                      <Link to={item.href} className="ig-row" onClick={() => setOpen(false)}>
                        {item.kind === "user" ? <Avatar src={item.avatar} alt="" /> : <span className="ig-mark">{item.kind === "tag" ? "#" : item.kind === "place" ? "⌖" : "▣"}</span>}
                        <span className="ig-row-copy">
                          <strong>{item.title}</strong>
                          <em>{item.subtitle}</em>
                        </span>
                      </Link>
                      <button type="button" className="ig-x" aria-label="Sil" onClick={() => forget(item.key)}>×</button>
                    </div>
                  ))}
                </section>
              ) : null}

              {searching ? <div className="ig-note"><LoadingDots label="Axtarılır" /></div> : null}
              {nothing ? <p className="ig-note">Nəticə tapılmadı. Başqa söz yoxla.</p> : null}

              {show("users") ? (
                <section className="ig-block">
                  <div className="ig-sec">
                    <h2>Hesablar</h2>
                    {tab === "all" && people.length > visiblePeople.length ? (
                      <button type="button" className="ig-text-btn" onClick={() => setTab("users")}>Hamısına bax</button>
                    ) : null}
                  </div>
                  {visiblePeople.length ? visiblePeople.map((user) => (
                    <Link
                      key={user.id || user.username}
                      to={`/profile/${user.username}`}
                      className="ig-row"
                      onClick={() => pick({
                        key: `user:${user.username}`,
                        kind: "user",
                        title: user.username,
                        subtitle: user.fullName || "Hesab",
                        href: `/profile/${user.username}`,
                        avatar: user.avatar || "",
                      })}
                    >
                      <Avatar src={user.avatar} alt="" />
                      <span className="ig-row-copy">
                        <strong>{user.username}</strong>
                        <em>{user.fullName || "Hesab"}</em>
                      </span>
                    </Link>
                  )) : ready || queryOn ? <p className="ig-empty">Hesab tapılmadı</p> : null}
                </section>
              ) : null}

              {show("posts") ? (
                <section className="ig-block">
                  <div className="ig-sec">
                    <h2>Postlar</h2>
                  </div>
                  {visiblePosts.length ? (
                    <div className="ig-post-grid">
                      {visiblePosts.map((item) => {
                        const media = item.media?.[0];
                        const video = media?.type === "video";
                        const href = item.kind === "post" ? postHref(item) : `/reels?v=${item.id}`;
                        const title = item.caption || item.poll?.question || (item.kind === "reel" ? "Video" : "Yazı");
                        return (
                          <Link
                            key={`${item.kind}-${item.id}`}
                            to={href}
                            className="ig-post"
                            onClick={() => pick({
                              key: `${item.kind}:${item.id}`,
                              kind: "post",
                              title,
                              subtitle: item.user?.username ? `@${item.user.username}` : "Post",
                              href,
                            })}
                          >
                            {video ? (
                              <AutoPlayVideo src={media.url} />
                            ) : media?.url ? (
                              <img src={media.url} alt="" loading="lazy" />
                            ) : (
                              <span className="ig-tile-text">{item.poll?.question || item.caption || "Yazı"}</span>
                            )}
                            {video ? <span className="explore-tile-badge">Video</span> : null}
                          </Link>
                        );
                      })}
                    </div>
                  ) : ready || queryOn ? <p className="ig-empty">Post tapılmadı</p> : null}
                </section>
              ) : null}

              {show("tags") ? (
                <section className="ig-block">
                  <div className="ig-sec">
                    <h2>Teqlər</h2>
                    {tab === "all" && tags.length > visibleTags.length ? (
                      <button type="button" className="ig-text-btn" onClick={() => setTab("tags")}>Hamısına bax</button>
                    ) : null}
                  </div>
                  {visibleTags.length ? visibleTags.map((tag) => (
                    <Link
                      key={tag.name}
                      to={`/hashtag/${encodeURIComponent(tag.name.toLowerCase())}`}
                      className="ig-row"
                      onClick={() => pick({
                        key: `tag:${tag.name.toLowerCase()}`,
                        kind: "tag",
                        title: `#${tag.name}`,
                        subtitle: tag.count ? `${tag.count} post` : "Teq",
                        href: `/hashtag/${encodeURIComponent(tag.name.toLowerCase())}`,
                      })}
                    >
                      <span className="ig-mark">#</span>
                      <span className="ig-row-copy">
                        <strong>#{tag.name}</strong>
                        <em>{tag.count ? `${tag.count} post` : "Teq"}</em>
                      </span>
                    </Link>
                  )) : ready || queryOn ? <p className="ig-empty">Teq tapılmadı</p> : null}
                </section>
              ) : null}

              {show("places") ? (
                <section className="ig-block">
                  <div className="ig-sec">
                    <h2>Yerlər</h2>
                    {tab === "all" && places.length > visiblePlaces.length ? (
                      <button type="button" className="ig-text-btn" onClick={() => setTab("places")}>Hamısına bax</button>
                    ) : null}
                  </div>
                  {visiblePlaces.length ? visiblePlaces.map((place) => (
                    <Link
                      key={place.name}
                      to={`/location/${encodeURIComponent(place.name)}`}
                      className="ig-row"
                      onClick={() => pick({
                        key: `place:${place.name}`,
                        kind: "place",
                        title: place.name,
                        subtitle: place.count ? `${place.count} post` : "Yer",
                        href: `/location/${encodeURIComponent(place.name)}`,
                      })}
                    >
                      <span className="ig-mark">⌖</span>
                      <span className="ig-row-copy">
                        <strong>{place.name}</strong>
                        <em>{place.count ? `${place.count} post` : "Yer"}</em>
                      </span>
                    </Link>
                  )) : ready || queryOn ? <p className="ig-empty">Yer tapılmadı</p> : null}
                </section>
              ) : null}

              {!queryOn && !recent.length && ready && !people.length && !posts.length ? (
                <p className="ig-note">İnsan, post, teq və ya yer yaz. Nəticələr burada açılacaq.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="search-body">
        {!ready ? (
          <>
            <MosaicSkeleton />
            <LoadingDots className="search-loading" />
          </>
        ) : items.length === 0 ? (
          <p className="muted search-empty">Nəticə yoxdur</p>
        ) : (
          <>
            <div className="explore-mosaic search-mosaic">
              {items.map((item) => {
                const media = item.media?.[0];
                const video = media?.type === "video";
                const href = item.kind === "post" ? postHref(item) : `/reels?v=${item.id}`;
                return (
                  <Link key={`${item.kind}-${item.id}`} to={href} className="explore-tile">
                    {video ? (
                      <AutoPlayVideo src={media.url} />
                    ) : media?.url ? (
                      <img src={media.url} alt="" loading="lazy" />
                    ) : (
                      <span className="explore-tile-text">{item.poll?.question || item.caption || "Yazı"}</span>
                    )}
                    {video ? <span className="explore-tile-badge">Video</span> : null}
                  </Link>
                );
              })}
            </div>
            <div ref={sentinelRef} className="search-sentinel" />
            {loadingMore ? <LoadingDots className="search-loading" /> : null}
          </>
        )}
      </div>
    </div>
  );
}
