import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import Avatar from "../../../components/ui/Avatar";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { formatCount } from "../../../utils/formatDate";
import ProfileGrid from "../../../features/profile/components/ProfileGrid";

function followLabel(relation) {
  if (relation === "following") return "İzləmə";
  if (relation === "requested") return "Sorğu göndərilib";
  return "İzlə";
}

export default function ProfilePage() {
  const { username } = useParams();
  const me = useAuthStore((s) => s.user);
  const [data, setData] = useState(null);
  const [list, setList] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [openHighlight, setOpenHighlight] = useState(null);
  const [views, setViews] = useState(null);

  async function load() {
    const d = await api.get(`/api/users/${username}`);
    setData(d);
    api.get(`/api/users/${username}/highlights`).then(setHighlights).catch(() => setHighlights([]));
  }

  useEffect(() => {
    load();
  }, [username]);

  if (!data) return <div className="page"><div className="spinner" /></div>;
  const { user, followers, following, posts, relation, blocked, restricted } = data;
  const isMe = me.id === user.id;
  const hidden = !!restricted || (user.isPrivate && !isMe && relation !== "following");

  async function follow() {
    await api.post(`/api/users/${user.id}/follow`);
    load();
  }

  async function block() {
    await api.post(`/api/users/${user.id}/block`);
    load();
  }

  async function openList(kind) {
    const items = await api.get(`/api/users/${user.username}/${kind}`);
    setList({ kind, items });
  }

  const listTitle = list?.kind === "followers" ? "İzləyicilər" : "İzlənilənlər";

  return (
    <div className="page profile-page">
      <section className="profile-card">
        <div className="profile-cover" />
        <div className="profile-body">
          <Avatar src={user.avatar} size="xl" />
          <div className="profile-main">
            <div className="profile-title-row">
              <div>
                <h2 className="profile-username">{user.username}</h2>
                <p className="profile-fullname">{user.fullName}</p>
              </div>
              <div className="profile-actions">
                {isMe ? (
                  <>
                    <Link className="btn btn-ghost" to="/settings">Profili redaktə et</Link>
                    <button type="button" className="btn btn-ghost" onClick={async () => setViews(await api.get("/api/profile/views"))}>Kim baxıb</button>
                  </>
                ) : (
                  <>
                    <Button onClick={follow}>{followLabel(relation)}</Button>
                    <Button variant="ghost" onClick={block}>{blocked ? "Blokdan çıxar" : "Blokla"}</Button>
                    <Button variant="ghost" onClick={async () => { const res = await api.post(`/api/users/${user.id}/mute`); setData({ ...data, muted: res.muted }); }}>{data.muted ? "Səsi aç" : "Səssiz"}</Button>
                    <Button variant="ghost" onClick={async () => { const res = await api.post(`/api/close-friends/${user.id}`); setData({ ...data, closeFriend: res.closeFriend }); }}>{data.closeFriend ? "Çevrədən çıxar" : "Yaxın çevrə"}</Button>
                    <Button
                      variant="ghost"
                      onClick={() => api.post("/api/reports", { targetType: "user", targetId: user.id, reason: "Uyğunsuz hesab" })}
                    >
                      Şikayət et
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="profile-stats">
              <div className="profile-stat">
                <strong>{posts.length}</strong>
                <span>paylaşım</span>
              </div>
              <button className="profile-stat" type="button" onClick={() => openList("followers")}>
                <strong>{formatCount(followers)}</strong>
                <span>izləyici</span>
              </button>
              <button className="profile-stat" type="button" onClick={() => openList("following")}>
                <strong>{formatCount(following)}</strong>
                <span>izləmə</span>
              </button>
            </div>

            {user.bio ? <p className="profile-bio">{user.bio}</p> : null}
            {user.website ? (
              <a className="profile-web" href={user.website} target="_blank" rel="noreferrer">{user.website}</a>
            ) : null}
            <span className={`profile-badge ${user.isPrivate ? "is-private" : ""}`}>
              {user.isPrivate ? "Gizli hesab" : "Açıq hesab"}
            </span>
          </div>
        </div>
      </section>

      {highlights.length ? (
        <div className="highlight-row">
          {highlights.map((h) => (
            <button key={h.id} type="button" className="highlight-chip" onClick={() => setOpenHighlight(h)}>
              {h.name}
            </button>
          ))}
        </div>
      ) : null}

      {posts.length && !hidden ? (
        <ProfileGrid posts={posts} />
      ) : (
        <div className="profile-empty">
          <p>{restricted ? "Bu profil bağlıdır" : hidden ? "Bu hesab gizlidir" : "Hələ paylaşım yoxdur"}</p>
        </div>
      )}

      <Modal open={!!openHighlight} onClose={() => setOpenHighlight(null)} title={openHighlight?.name || "Seçilmiş"}>
        {openHighlight?.items?.map((item) => (
          <div key={item.id} className="highlight-slide">
            {item.mediaType === "video" ? <video src={item.mediaUrl} controls /> : <img src={item.mediaUrl} alt="" />}
            {item.text ? <p>{item.text}</p> : null}
          </div>
        ))}
        {isMe && openHighlight ? <Button variant="ghost" type="button" onClick={async () => { await api.delete(`/api/highlights/${openHighlight.id}`); setOpenHighlight(null); load(); }}>Sil</Button> : null}
      </Modal>
      <Modal open={!!views} onClose={() => setViews(null)} title="Profilə baxanlar">
        {views?.length ? views.map((row) => (
          <Link key={row.user.id} to={`/profile/${row.user.username}`} className="chat-item" onClick={() => setViews(null)}>
            <Avatar src={row.user.avatar} />
            <span><strong>@{row.user.username}</strong>{row.user.isOnline ? <span className="muted"> · onlayn</span> : null}</span>
          </Link>
        )) : <p className="muted">Hələ baxış yoxdur</p>}
      </Modal>
      <Modal open={!!list} onClose={() => setList(null)} title={listTitle}>
        {list?.items.map((u) => (
          <Link key={u.id} to={`/profile/${u.username}`} className="chat-item" onClick={() => setList(null)}>
            <Avatar src={u.avatar} />
            <span>
              <strong>{u.username}</strong>
              {u.fullName ? <span className="muted"> · {u.fullName}</span> : null}
            </span>
          </Link>
        ))}
      </Modal>
    </div>
  );
}
