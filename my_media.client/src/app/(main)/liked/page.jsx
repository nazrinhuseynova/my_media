import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { postApi } from "../../../features/post/services/postApi";
import Icon from "../../../components/ui/Icon";
import LoadingDots from "../../../components/ui/LoadingDots";
import MediaLibrary, { toMediaTiles } from "../../../features/post/components/MediaLibrary";

export default function LikedPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const busyRef = useRef(false);
  const sentinelRef = useRef(null);

  const load = useCallback(async (nextPage, replace) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (!replace) setLoadingMore(true);
    try {
      const data = await postApi.liked(nextPage, 12);
      const tiles = toMediaTiles(data?.posts || data?.items, data?.reels);
      setItems((prev) => (replace ? tiles : [...prev, ...tiles]));
      setPage(nextPage);
      setHasMore(!!data?.hasMore);
    } catch {
      if (replace) setItems([]);
      setHasMore(false);
    } finally {
      busyRef.current = false;
      setReady(true);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(1, true);
  }, [load]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) load(page + 1, false);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, load, page]);

  return (
    <div className="page library-page">
      <header className="settings-head">
        <button type="button" className="reels-back" onClick={() => navigate("/settings")}>
          <Icon name="back" size={22} />
          <span>Geri</span>
        </button>
        <div>
          <h2>Bəyənilənlər</h2>
          <p className="muted">Ürək basdığın foto və videolar</p>
        </div>
      </header>
      {!ready ? <LoadingDots /> : <MediaLibrary items={items} />}
      <div ref={sentinelRef} />
      {loadingMore ? <LoadingDots /> : null}
    </div>
  );
}
