import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { postApi } from "../../../features/post/services/postApi";
import { notify } from "../../../stores/useNoticeStore";

export default function ShelfPage() {
  const drafts = useLocation().pathname.includes("draft");
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = drafts ? postApi.drafts : postApi.archived;
    load().then((data) => setPosts(Array.isArray(data) ? data : (data?.items || []))).catch(() => setPosts([]));
  }, [drafts]);

  async function publish(id) {
    setError("");
    try {
      await postApi.update(id, { publishDraft: true });
      setPosts((list) => list.filter((p) => p.id !== id));
      notify("Qaralama paylaşıldı");
    } catch (err) {
      notify(err.response?.data?.message || "Paylaşılmadı", true);
    }
  }

  async function restore(id) {
    await postApi.archive(id);
    setPosts((list) => list.filter((p) => p.id !== id));
    notify("Arxivdən çıxarıldı");
  }

  return (
    <div className="page">
      <h2>{drafts ? "Qaralamalar" : "Arxiv"}</h2>
      <p className="muted">{drafts ? "Hələ paylaşılmamış yazılar" : "Lentdən gizlədilmiş yazılar"}</p>
      {error ? <p className="error-text">{error}</p> : null}
      {posts.length === 0 ? <p className="muted">Boşdur</p> : (
        <div className="settings-mosaic">
          {posts.map((p) => (
            <div key={p.id} className="collection-tile">
              <Link to={`/p/${p.id}`}>{p.media?.[0]?.url ? <img src={p.media[0].url} alt="" /> : <span>{p.caption || "Yazı"}</span>}</Link>
              {drafts ? <button type="button" className="btn btn-primary" onClick={() => publish(p.id)}>Paylaş</button> : null}
              {!drafts ? <button type="button" className="btn btn-ghost" onClick={() => restore(p.id)}>Geri qaytar</button> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
