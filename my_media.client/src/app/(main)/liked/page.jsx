import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { postApi } from "../../../features/post/services/postApi";
import Icon from "../../../components/ui/Icon";
import MediaLibrary, { toMediaTiles } from "../../../features/post/components/MediaLibrary";

export default function LikedPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);

  useEffect(() => {
    postApi.liked()
      .then((data) => setItems(toMediaTiles(data?.posts, data?.reels)))
      .catch(() => setItems([]));
  }, []);

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
      <MediaLibrary items={items} />
    </div>
  );
}
