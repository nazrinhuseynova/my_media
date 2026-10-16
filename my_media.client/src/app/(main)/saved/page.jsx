import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { postApi } from "../../../features/post/services/postApi";
import { mediaSrc } from "../../../utils/upload";
import Icon from "../../../components/ui/Icon";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import LoadingDots from "../../../components/ui/LoadingDots";
import { notify } from "../../../stores/useNoticeStore";
import { postHref } from "../../../utils/postHref";

export default function SavedPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [name, setName] = useState("");
  const [active, setActive] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const busyRef = useRef(false);
  const sentinelRef = useRef(null);

  const load = useCallback(async (nextPage, replace) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (!replace) setLoadingMore(true);
    try {
      const data = await postApi.saved(nextPage, 12);
      const rows = data?.posts || [];
      setPosts((prev) => (replace ? rows : [...prev, ...rows]));
      if (replace) setCollections(data?.collections || []);
      setPage(nextPage);
      setHasMore(!!data?.hasMore);
      setError("");
    } catch {
      if (replace) {
        setPosts([]);
        setError("Saxlanılanlar açılmadı");
      }
      setHasMore(false);
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(1, true);
  }, [load]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || active) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) load(page + 1, false);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, load, page, active]);

  async function create(e) {
    e.preventDefault();
    const title = name.trim();
    if (!title) {
      notify("Kolleksiya adı yaz", true);
      return;
    }
    setError("");
    try {
      const col = await postApi.createCollection({ name: title });
      setCollections((list) => [...list, col]);
      setName("");
      setActive(col.id);
      notify("Kolleksiya yaradıldı");
    } catch (err) {
      notify(err.response?.data?.message || "Kolleksiya yaradılmadı", true);
    }
  }

  async function add(collectionId, postId) {
    if (!collectionId) return;
    setError("");
    try {
      const next = await postApi.addToCollection(collectionId, { type: "post", id: postId });
      setCollections((list) => list.map((c) => (c.id === collectionId ? { ...c, items: next.items } : c)));
      notify("Kolleksiyaya əlavə olundu");
    } catch (err) {
      notify(err.response?.data?.message || "Əlavə olunmadı", true);
    }
  }

  async function removeCollection() {
    if (!active) return;
    await postApi.deleteCollection(active);
    setCollections((list) => list.filter((c) => c.id !== active));
    setActive("");
    notify("Kolleksiya silindi");
  }

  async function takeOut(postId) {
    if (!active) return;
    const next = await postApi.removeFromCollection(active, "post", postId);
    setCollections((list) => list.map((c) => (c.id === active ? { ...c, items: next.items } : c)));
    notify("Kolleksiyadan çıxarıldı");
  }

  const shown = active
    ? posts.filter((p) => collections.find((c) => c.id === active)?.items?.some((i) => i.id === p.id))
    : posts;

  return (
    <div className="page library-page">
      <header className="settings-head">
        <button type="button" className="reels-back" onClick={() => navigate("/settings")}>
          <Icon name="back" size={22} />
          <span>Geri</span>
        </button>
        <div>
          <h2>Saxlanılanlar</h2>
          <p className="muted">Bookmark etdiyin foto və videolar</p>
        </div>
      </header>

      <form className="collection-create" onSubmit={create}>
        <Input label="Yeni kolleksiya" value={name} onChange={(e) => setName(e.target.value)} placeholder="Məsələn, Yay" />
        <Button type="submit">Yarat</Button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}

      <div className="collection-tabs">
        <button type="button" className={`btn ${active ? "btn-ghost" : "btn-primary"}`} onClick={() => setActive("")}>Hamısı</button>
        {collections.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`btn ${active === c.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setActive(c.id)}
          >
            {c.name} ({c.items?.length || 0})
          </button>
        ))}
        {active ? <button type="button" className="btn btn-ghost" onClick={removeCollection}>Kolleksiyanı sil</button> : null}
      </div>

      {shown.length ? (
        <div className="settings-mosaic">
          {shown.map((p) => {
            const media = p.media?.[0];
            if (!media?.url) return null;
            return (
              <div key={p.id} className="collection-tile">
                <Link to={postHref(p)} className="explore-tile">
                  {media.type === "video" ? (
                    <video src={mediaSrc(media.url)} muted playsInline preload="metadata" />
                  ) : (
                    <img src={mediaSrc(media.url)} alt="" />
                  )}
                </Link>
                <select
                  className="collection-pick"
                  value=""
                  onChange={(e) => add(e.target.value, p.id)}
                  aria-label="Kolleksiyaya əlavə et"
                >
                  <option value="">Kolleksiyaya əlavə et</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.items?.some((i) => i.id === p.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {active ? <button type="button" className="btn btn-ghost" onClick={() => takeOut(p.id)}>Çıxart</button> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">{active ? "Bu kolleksiya boşdur" : "Hələ heç nə yoxdur"}</p>
      )}
      {!active ? <div ref={sentinelRef} /> : null}
      {loadingMore ? <LoadingDots /> : null}
    </div>
  );
}
