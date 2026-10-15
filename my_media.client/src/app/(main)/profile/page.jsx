import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import Avatar from "../../../components/ui/Avatar";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { formatCount, asUtc } from "../../../utils/formatDate";
import { notify } from "../../../stores/useNoticeStore";
import { useAccountSheet } from "../../../features/auth/components/AccountSheet";
import { ProfileSkeleton } from "../../../components/ui/Skeleton";
import ProfileGrid from "../../../features/profile/components/ProfileGrid";
import HighlightRail from "../../../features/profile/components/HighlightRail";

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];

function formatSeen(iso) {
  const date = asUtc(iso);
  if (!date || Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${hours}:${minutes}`;
}

function followLabel(relation) {
  if (relation === "following") return "İzləmə";
  if (relation === "requested") return "Sorğu göndərilib";
  return "İzlə";
}

export default function ProfilePage() {
  const { username } = useParams();
  const me = useAuthStore((s) => s.user);
  const showAccounts = useAccountSheet((s) => s.show);
  const [data, setData] = useState(null);
  const [list, setList] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [views, setViews] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  async function load(nextPage = 1) {
    const d = await api.get(`/api/users/${username}`, { params: { page: nextPage, pageSize: 12 } });
    const postPage = Array.isArray(d.posts)
      ? { items: d.posts, totalCount: d.posts.length, hasMore: false, page: 1 }
      : { items: d.posts?.items || [], totalCount: d.posts?.totalCount || 0, hasMore: !!d.posts?.hasMore, page: d.posts?.page || 1 };
    setData((prev) => ({
      ...d,
      posts: nextPage > 1 && prev ? [...prev.posts, ...postPage.items] : postPage.items,
      postCount: postPage.totalCount,
      hasMorePosts: postPage.hasMore,
      postsPage: postPage.page,
    }));
    api.get(`/api/users/${username}/highlights`).then(setHighlights).catch(() => setHighlights([]));
  }

  useEffect(() => {
    load();
  }, [username]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (!data) return <ProfileSkeleton />;
  const { user, followers, following, posts, relation, blocked, restricted } = data;
  const isMe = me?.id === user.id;
  const hidden = !!restricted || (user.isPrivate && !isMe && relation !== "following");

  async function follow() {
    await api.post(`/api/users/${user.id}/follow`);
    if (relation === "following") notify("İzləmə dayandırıldı");
    else if (user.isPrivate && relation !== "requested") notify("İzləmə sorğusu göndərildi");
    else if (relation === "requested") notify("İzləmə sorğusu geri alındı");
    else notify("İzlədin");
    load();
  }

  async function block() {
    await api.post(`/api/users/${user.id}/block`);
    notify(blocked ? "Blokdan çıxarıldı" : "Bloklandı");
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
                {isMe ? (
                  <button type="button" className="profile-account-btn" onClick={showAccounts} aria-haspopup="dialog">
                    <h2 className="profile-username">{user.username}</h2>
                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                ) : <h2 className="profile-username">{user.username}</h2>}
                <p className="profile-fullname">{user.fullName}</p>
              </div>
              <div className="profile-actions">
                {isMe ? (
                  <>
                    <Link className="btn btn-ghost" to="/settings">Profili redaktə et</Link>
                    <button type="button" className="btn btn-ghost" onClick={async () => setViews(await api.get("/api/profile/views"))}>Kim baxıb</button>
                    <div className="profile-menu-wrap" ref={menuRef}>
                      <button
                        type="button"
                        className="profile-menu-btn"
                        aria-label="Daha çox"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((open) => !open)}
                      >
                        <span className="profile-menu-lines" aria-hidden="true">
                          <i /><i /><i />
                        </span>
                      </button>
                      {menuOpen ? (
                        <div className="profile-menu" role="menu">
                          <Link to="/liked" role="menuitem" onClick={() => setMenuOpen(false)}>Bəyəndiklər</Link>
                          <Link to="/saved" role="menuitem" onClick={() => setMenuOpen(false)}>Saxlanılanlar</Link>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <Button onClick={follow}>{followLabel(relation)}</Button>
                    <Button variant="ghost" onClick={block}>{blocked ? "Blokdan çıxar" : "Blokla"}</Button>
                    <Button variant="ghost" onClick={async () => { const res = await api.post(`/api/users/${user.id}/mute`); setData({ ...data, muted: res.muted }); notify(res.muted ? "Səssizə alındı" : "Səs açıldı"); }}>{data.muted ? "Səsi aç" : "Səssiz"}</Button>
                    <Button variant="ghost" onClick={async () => { const res = await api.post(`/api/close-friends/${user.id}`); setData({ ...data, closeFriend: res.closeFriend }); notify(res.closeFriend ? "Yaxın çevrəyə əlavə olundu" : "Yaxın çevrədən çıxarıldı"); }}>{data.closeFriend ? "Çevrədən çıxar" : "Yaxın çevrə"}</Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await api.post("/api/reports", { targetType: "user", targetId: user.id, reason: "Uyğunsuz hesab" });
                          notify("Şikayət göndərildi");
                        } catch (err) {
                          notify(err?.response?.data?.message || "Şikayət göndərilmədi", true);
                        }
                      }}
                    >
                      Şikayət et
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="profile-stats">
              <div className="profile-stat">
                <strong>{data.postCount ?? posts.length}</strong>
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

      <HighlightRail
        highlights={highlights}
        isMe={isMe}
        onChanged={() => api.get(`/api/users/${username}/highlights`).then(setHighlights).catch(() => setHighlights([]))}
      />

      {posts.length && !hidden ? (
        <>
          <ProfileGrid posts={posts} />
          {data.hasMorePosts ? (
            <button type="button" className="btn btn-ghost" onClick={() => load((data.postsPage || 1) + 1)}>Daha çox</button>
          ) : null}
        </>
      ) : (
        <div className="profile-empty">
          <p>{restricted ? "Bu profil bağlıdır" : hidden ? "Bu hesab gizlidir" : "Hələ paylaşım yoxdur"}</p>
        </div>
      )}

      <Modal open={!!views} onClose={() => setViews(null)} title="Profilə baxanlar">
        {views?.enabled === false ? (
          <p className="muted">Baxışlar bağlıdır. Ayarlardan «Profil baxışları»nı açanda son 7 günün siyahısını görürsən.</p>
        ) : views?.items?.length ? views.items.map((row) => (
          <Link key={row.user.id} to={`/profile/${row.user.username}`} className="view-row" onClick={() => setViews(null)}>
            <Avatar src={row.user.avatar} />
            <span>
              <strong>@{row.user.username}</strong>
              <small className="muted">{formatSeen(row.seenAt)}</small>
            </span>
          </Link>
        )) : <p className="muted">Son 7 gündə baxış yoxdur</p>}
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
