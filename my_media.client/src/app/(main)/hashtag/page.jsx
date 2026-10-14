import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../services/api";
import { notify } from "../../../stores/useNoticeStore";
import { postHref } from "../../../utils/postHref";

export default function HashtagPage() {
  const { tag } = useParams();
  const [data, setData] = useState({ items: [], following: false });
  useEffect(() => {
    api.get(`/api/hashtags/${tag}`).then(setData);
  }, [tag]);
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
    </div>
  );
}
