import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../services/api";
import { postHref } from "../../../utils/postHref";

export default function LocationPage() {
  const { name } = useParams();
  const loc = decodeURIComponent(name);
  const [data, setData] = useState({ items: [] });
  useEffect(() => {
    api.get(`/api/locations/${encodeURIComponent(loc)}`).then(setData);
  }, [loc]);
  return (
    <div className="page">
      <h2>{loc}</h2>
      <div className="grid">
        {data.items.map((p) => (
          <Link key={p.id} to={postHref(p)}><img src={p.media[0]?.url} alt="" loading="lazy" /></Link>
        ))}
      </div>
    </div>
  );
}
