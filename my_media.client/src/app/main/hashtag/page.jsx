import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../services/api";

export default function HashtagPage() {
  const { tag } = useParams();
  const [data, setData] = useState({ items: [], following: false });
  useEffect(() => {
    api.get(`/api/hashtags/${tag}`).then(setData);
  }, [tag]);
  async function follow() {
    const res = await api.post(`/api/hashtags/${tag}/follow`);
    setData((d) => ({ ...d, following: res.following }));
  }
  return (
    <div className="page">
      <div className="row space-between">
        <h2>#{tag}</h2>
        <button type="button" className="btn btn-primary" onClick={follow}>{data.following ? "İzləməni dayandır" : "Etiketi izlə"}</button>
      </div>
      <div className="grid">
        {(data.items || []).map((p) => (
          <Link key={p.id} to={`/p/${p.id}`}>
            {p.media?.[0]?.url ? <img src={p.media[0].url} alt="" /> : <span>{p.caption || p.poll?.question || "Yazı"}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
