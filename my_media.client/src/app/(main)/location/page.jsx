import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../services/api";
import { postHref } from "../../../utils/postHref";

export default function LocationPage() {
  const { name } = useParams();
  const loc = decodeURIComponent(name);
  const [data, setData] = useState({ items: [], hasMore: false, page: 1 });
  const busy = useRef(false);
  const sentinel = useRef(null);

  useEffect(() => {
    busy.current = false;
    api.get(`/api/locations/${encodeURIComponent(loc)}`, { params: { page: 1, pageSize: 12 } }).then((d) => {
      setData({
        items: d?.items || [],
        hasMore: !!d?.hasMore,
        page: d?.page || 1,
      });
    });
  }, [loc]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !data.hasMore) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || busy.current) return;
      busy.current = true;
      const next = (data.page || 1) + 1;
      api.get(`/api/locations/${encodeURIComponent(loc)}`, { params: { page: next, pageSize: 12 } })
        .then((d) => {
          setData((prev) => ({
            ...prev,
            items: [...prev.items, ...(d?.items || [])],
            hasMore: !!d?.hasMore,
            page: d?.page || next,
          }));
        })
        .finally(() => { busy.current = false; });
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [data.hasMore, data.page, loc]);

  return (
    <div className="page">
      <h2>{loc}</h2>
      <div className="grid">
        {(data.items || []).map((p) => {
          const url = p.media?.[0]?.url;
          return (
            <Link key={p.id} to={postHref(p)}>
              {url ? <img src={url} alt="" loading="lazy" /> : <span>{p.caption || p.poll?.question || "Yazı"}</span>}
            </Link>
          );
        })}
      </div>
      <div ref={sentinel} />
    </div>
  );
}
