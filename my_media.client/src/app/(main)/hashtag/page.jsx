import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../services/api";
import { notify } from "../../../stores/useNoticeStore";
import { postHref } from "../../../utils/postHref";

export default function HashtagPage() {
  const { tag } = useParams();
  const [data, setData] = useState({ items: [], following: false, hasMore: false, page: 1 });
  const busy = useRef(false);
  const sentinel = useRef(null);

  useEffect(() => {
    busy.current = false;
    api.get(`/api/hashtags/${tag}`, { params: { page: 1, pageSize: 12 } }).then((d) => {
      setData({
        items: d?.items || [],
        following: !!d?.following,
        hasMore: !!d?.hasMore,
        page: d?.page || 1,
      });
    });
  }, [tag]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !data.hasMore) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || busy.current) return;
      busy.current = true;
      const next = (data.page || 1) + 1;
      api.get(`/api/hashtags/${tag}`, { params: { page: next, pageSize: 12 } })
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
  }, [data.hasMore, data.page, tag]);

  async function follow() {
    const res = await api.post(`/api/hashtags/${tag}/follow`);
    setData((d) => ({ ...d, following: res.following }));
    notify(res.following ? "Etiket izlənilir" : "Etiket izləməsi dayandı");
  }

  return (
    <div className="page">
      <div className="row space-between">
        <h2>#{tag}</h2>
        <button type="button" className="btn btn-primary" onClick={follow}>{data.following ? "İzləməni dayandır" : "Etiketi izlə"}</button>
      </div>
      <div className="grid">
        {(data.items || []).map((p) => (
          <Link key={p.id} to={postHref(p)}>
            {p.media?.[0]?.url ? <img src={p.media[0].url} alt="" /> : <span>{p.caption || p.poll?.question || "Yazı"}</span>}
          </Link>
        ))}
      </div>
      <div ref={sentinel} />
    </div>
  );
}
