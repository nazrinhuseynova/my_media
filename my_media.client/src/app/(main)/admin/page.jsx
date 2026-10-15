import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import Button from "../../../components/ui/Button";
import AdminGuard from "../../../features/admin/components/AdminGuard";
import { ListSkeleton } from "../../../components/ui/Skeleton";
import { notify } from "../../../stores/useNoticeStore";
import { mediaSrc } from "../../../utils/upload";
import { postHref } from "../../../utils/postHref";

const STATS = [
  ["users", "Hesab", "users"],
  ["online", "Onlayn izləyici", "online"],
  ["banned", "Blok", "users"],
  ["posts", "Post", "posts"],
  ["shares", "Paylaşım", "posts"],
  ["comments", "Şərh", "comments"],
  ["reels", "Reel", "reels"],
  ["stories", "Hekayə", "stories"],
  ["lives", "Canlı", "lives"],
  ["reports", "Açıq şikayət", "reports"],
];

const TITLES = {
  overview: "İcmal",
  users: "İstifadəçilər",
  online: "Onlayn izləyicilər",
  posts: "Postlar",
  comments: "Şərhlər",
  reels: "Reels",
  stories: "Hekayələr",
  lives: "Canlı yayımlar",
  reports: "Şikayətlər",
};

const REPORT_FILTERS = [
  ["open", "Açıq"],
  ["dismissed", "Rədd"],
  ["remove", "Silinmiş"],
  ["ban", "Blok"],
  ["all", "Hamısı"],
];

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function problem(err, fallback) {
  return err?.response?.data?.message || fallback;
}

function Thumb({ url, type }) {
  const src = mediaSrc(url);
  if (!src) return <span className="admin-media-empty" />;
  if (type === "video") return <video src={src} muted controls preload="metadata" />;
  return <img src={src} alt="" />;
}

export default function AdminPage() {
  const me = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const section = params.get("section") || "overview";
  const q = params.get("q") || "";
  const reportStatus = params.get("status") || "open";
  const [draft, setDraft] = useState(q);
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [ask, setAsk] = useState(null);
  const requestKey = `${section}|${q}|${section === "reports" ? reportStatus : ""}`;
  const ready = loadedKey === requestKey;

  useEffect(() => {
    setDraft(q);
  }, [q]);

  useEffect(() => {
    if (me?.role !== "admin") return undefined;
    let alive = true;
    const query = {};
    if (q) query.q = q;
    if (section === "reports") query.status = reportStatus;
    const load = section === "overview"
      ? api.get("/api/admin/stats")
      : api.get(`/api/admin/${section}`, { params: query });
    load.then((data) => {
      if (!alive) return;
      if (section === "overview") setStats(data);
      else setRows(Array.isArray(data) ? data : []);
      setLoadedKey(requestKey);
    }).catch((err) => {
      if (!alive) return;
      notify(problem(err, "Siyahı açılmadı"), true);
      setRows([]);
      setLoadedKey(requestKey);
    });
    return () => {
      alive = false;
    };
  }, [me, section, q, reportStatus, requestKey]);

  function search(e) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    const text = draft.trim();
    if (text) next.set("q", text);
    else next.delete("q");
    setParams(next, { replace: true });
  }

  function setStatus(value) {
    const next = new URLSearchParams(params);
    if (value === "open") next.delete("status");
    else next.set("status", value);
    setParams(next, { replace: true });
  }

  async function run(work) {
    try {
      return await work();
    } catch (err) {
      notify(problem(err, "Əməliyyat alınmadı"), true);
      return null;
    }
  }

  async function banUser(row, mode) {
    const data = await run(() => api.post(`/api/admin/users/${row.id}/ban`, { mode }));
    if (!data) return;
    setRows((list) => list.map((item) => item.id === row.id ? { ...item, isBanned: data.isBanned, bannedUntil: data.bannedUntil } : item));
    setAsk(null);
    notify(data.isBanned ? (data.bannedUntil ? "Hesab müddətli bloklandı" : "Hesab həmişəlik bloklandı") : "Blok açıldı");
  }

  async function removeRow(row, work, message) {
    const data = await run(work);
    if (!data) return;
    setRows((list) => list.filter((item) => item.id !== row.id));
    setAsk(null);
    notify(message);
  }

  async function resolve(row, action, mode) {
    const data = await run(() => api.post(`/api/admin/reports/${row.id}/resolve`, { action, mode }));
    if (!data) return;
    setRows((list) => {
      if (reportStatus === "open") {
        if (action === "dismissed") return list.filter((item) => item.id !== row.id);
        return list.filter((item) => item.targetType !== row.targetType || item.targetId !== row.targetId);
      }
      return list.map((item) => {
        const same = item.targetType === row.targetType && item.targetId === row.targetId && item.status === "open";
        if (action === "dismissed") return item.id === row.id ? { ...item, status: data.status } : item;
        return same ? { ...item, status: data.status } : item;
      });
    });
    setAsk(null);
    notify(action === "dismissed" ? "Şikayət rədd edildi" : action === "remove" ? "Hədəf götürüldü" : "Hesab bloklandı");
  }

  function decide(key, node) {
    if (ask === key) {
      return (
        <>
          {node}
          <Button variant="ghost" onClick={() => setAsk(null)}>Saxla</Button>
        </>
      );
    }
    return null;
  }

  return (
    <AdminGuard>
      <div className="page admin-desk">
        <header className="admin-head">
          <h1>{TITLES[section] || "Nəzarət"}</h1>
          <p className="muted">Hesab, paylaşım, şərh, reel, hekayə, canlı yayım və şikayət növbəsi.</p>
        </header>
        {section === "overview" ? (
          stats ? (
            <div className="admin-stats">
              {STATS.map(([key, label, dest]) => (
                <Link key={key} to={dest === "overview" ? "/admin" : `/admin?section=${dest}`} className="card admin-stat">
                  <span className="muted">{label}</span>
                  <strong>{stats[key] ?? 0}</strong>
                </Link>
              ))}
            </div>
          ) : <ListSkeleton />
        ) : (
          <>
            <form className="admin-search" onSubmit={search}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Axtar" />
              <Button type="submit">Axtar</Button>
            </form>
            {section === "reports" ? (
              <div className="admin-tabs">
                {REPORT_FILTERS.map(([value, label]) => (
                  <button key={value} type="button" className={reportStatus === value ? "is-on" : ""} onClick={() => setStatus(value)}>{label}</button>
                ))}
              </div>
            ) : null}
            {!ready ? <ListSkeleton /> : null}
            {ready && rows.length === 0 ? <p className="muted">Uyğun nəticə yoxdur</p> : null}
            {ready ? (
              <div className="admin-list">
                {section === "users" ? rows.map((row) => (
                  <article key={row.id} className={`card admin-row ${mediaSrc(row.avatar) ? "" : "admin-row-plain"}`}>
                    {mediaSrc(row.avatar) ? <img src={mediaSrc(row.avatar)} alt="" /> : null}
                    <div>
                      <strong>@{row.username}</strong>
                      <p>{row.fullName}</p>
                      <p className="muted">{row.email} · {row.posts} post · {when(row.createdAt)}</p>
                      <p className="muted">
                        {row.role === "admin" ? "Admin" : row.isBanned ? (row.bannedUntil ? `${when(row.bannedUntil)} tarixinədək blok` : "Həmişəlik blok") : "Hesab açıq"}
                        {row.isOnline ? " · Onlayn" : ""}
                      </p>
                    </div>
                    {row.role === "admin" ? null : (
                      <div className="admin-actions">
                        {row.isBanned ? (
                          <Button variant="ghost" onClick={() => banUser(row, "lift")}>Bloku aç</Button>
                        ) : (
                          <>
                            <Button variant="ghost" onClick={() => banUser(row, "day")}>1 gün</Button>
                            <Button variant="ghost" onClick={() => banUser(row, "week")}>7 gün</Button>
                            <Button variant="ghost" onClick={() => banUser(row, "month")}>30 gün</Button>
                            {decide(`ban:${row.id}`, <Button variant="danger" onClick={() => banUser(row, "permanent")}>Bloklansın</Button>)
                              || <Button variant="danger" onClick={() => setAsk(`ban:${row.id}`)}>Həmişəlik</Button>}
                          </>
                        )}
                        {decide(`user:${row.id}`, (
                          <Button variant="danger" onClick={() => removeRow(row, () => api.delete(`/api/admin/users/${row.id}`), "Hesab silindi")}>Silinsin</Button>
                        )) || <Button variant="danger" onClick={() => setAsk(`user:${row.id}`)}>Sil</Button>}
                      </div>
                    )}
                  </article>
                )) : null}
                {section === "online" ? rows.map((row) => (
                  <article key={row.id} className={`card admin-row ${mediaSrc(row.avatar) ? "" : "admin-row-plain"}`}>
                    {mediaSrc(row.avatar) ? <img src={mediaSrc(row.avatar)} alt="" /> : null}
                    <div>
                      <strong>@{row.username}</strong>
                      <p>{row.fullName}</p>
                      <p className="muted">Hazırda onlayn (real bağlantı)</p>
                    </div>
                    <div className="admin-actions">
                      <Link to={`/profile/${row.username}`}>Profil</Link>
                    </div>
                  </article>
                )) : null}
                {section === "posts" ? rows.map((row) => (
                  <article key={row.id} className="card admin-row">
                    <Thumb url={row.mediaUrl} type={row.mediaType} />
                    <div>
                      <strong>@{row.username}</strong>
                      <p>{row.caption || "Yazısız paylaşım"}</p>
                      <p className="muted">{row.likes} bəyənmə · {row.comments} şərh · {row.shares} paylaşım · {when(row.createdAt)}</p>
                      <p className="muted">{[row.isShare ? "paylaşım" : "", row.isDraft ? "qaralama" : "", row.isArchived ? "arxiv" : ""].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="admin-actions">
                      <Link to={postHref(row)}>Bax</Link>
                      {decide(`post:${row.id}`, (
                        <Button variant="danger" onClick={() => removeRow(row, () => api.delete(`/api/admin/posts/${row.id}`), "Post silindi")}>Silinsin</Button>
                      )) || <Button variant="danger" onClick={() => setAsk(`post:${row.id}`)}>Sil</Button>}
                    </div>
                  </article>
                )) : null}
                {section === "comments" ? rows.map((row) => (
                  <article key={`${row.kind}-${row.id}`} className="card admin-row admin-row-plain">
                    <div>
                      <strong>@{row.username}</strong>
                      <p>{row.text}</p>
                      <p className="muted">{row.kind === "reel" ? "Reel şərhi" : "Post şərhi"} · {row.target} · {when(row.createdAt)}</p>
                    </div>
                    <div className="admin-actions">
                      {decide(`comment:${row.id}`, (
                        <Button variant="danger" onClick={() => removeRow(row, () => api.delete(`/api/admin/comments/${row.kind}/${row.id}`), "Şərh silindi")}>Silinsin</Button>
                      )) || <Button variant="danger" onClick={() => setAsk(`comment:${row.id}`)}>Sil</Button>}
                    </div>
                  </article>
                )) : null}
                {section === "reels" ? rows.map((row) => (
                  <article key={row.id} className="card admin-row">
                    <Thumb url={row.videoUrl} type="video" />
                    <div>
                      <strong>@{row.username}</strong>
                      <p>{row.caption || "Yazısız reel"}</p>
                      <p className="muted">{row.likes} bəyənmə · {row.comments} şərh · {when(row.createdAt)}</p>
                    </div>
                    <div className="admin-actions">
                      {decide(`reel:${row.id}`, (
                        <Button variant="danger" onClick={() => removeRow(row, () => api.delete(`/api/admin/reels/${row.id}`), "Reel silindi")}>Silinsin</Button>
                      )) || <Button variant="danger" onClick={() => setAsk(`reel:${row.id}`)}>Sil</Button>}
                    </div>
                  </article>
                )) : null}
                {section === "stories" ? rows.map((row) => (
                  <article key={row.id} className="card admin-row">
                    <Thumb url={row.mediaUrl} type={row.mediaType} />
                    <div>
                      <strong>@{row.username}</strong>
                      <p>{row.text || "Yazısız hekayə"}</p>
                      <p className="muted">{row.views} baxış · {when(row.createdAt)}</p>
                    </div>
                    <div className="admin-actions">
                      {decide(`story:${row.id}`, (
                        <Button variant="danger" onClick={() => removeRow(row, () => api.delete(`/api/admin/stories/${row.id}`), "Hekayə silindi")}>Silinsin</Button>
                      )) || <Button variant="danger" onClick={() => setAsk(`story:${row.id}`)}>Sil</Button>}
                    </div>
                  </article>
                )) : null}
                {section === "lives" ? rows.map((row) => (
                  <article key={row.id} className="card admin-row admin-row-plain">
                    <div>
                      <strong>{row.title || "Adsız yayım"}</strong>
                      <p>@{row.username || "aparıcı yoxdur"}</p>
                      <p className="muted">{row.seats} nəfər · {when(row.createdAt)}</p>
                    </div>
                    <div className="admin-actions">
                      {decide(`live:${row.id}`, (
                        <Button variant="danger" onClick={() => removeRow(row, () => api.post(`/api/admin/lives/${row.id}/end`), "Yayım bitirildi")}>Bitirilsin</Button>
                      )) || <Button variant="danger" onClick={() => setAsk(`live:${row.id}`)}>Yayımı bitir</Button>}
                    </div>
                  </article>
                )) : null}
                {section === "reports" ? rows.map((row) => (
                  <article key={row.id} className={`card admin-row ${mediaSrc(row.mediaUrl) ? "" : "admin-row-plain"}`}>
                    {mediaSrc(row.mediaUrl) ? <Thumb url={row.mediaUrl} type={row.mediaType} /> : null}
                    <div>
                      <strong>{row.reason}</strong>
                      <p>{labelFor(row.targetType)} · @{row.owner || "naməlum"} · {row.label || (row.gone ? "Hədəf artıq yoxdur" : "Yazısız")}</p>
                      <p className="muted">@{row.from} göndərib · {statusLabel(row.status)} · {when(row.createdAt)}</p>
                    </div>
                    {row.status === "open" ? (
                      <div className="admin-actions">
                        <Button variant="ghost" onClick={() => resolve(row, "dismissed")}>Rədd et</Button>
                        {decide(`remove:${row.id}`, (
                          <Button variant="danger" onClick={() => resolve(row, "remove")}>Silinsin</Button>
                        )) || <Button variant="danger" onClick={() => setAsk(`remove:${row.id}`)}>Sil</Button>}
                        <Button variant="ghost" onClick={() => resolve(row, "ban", "week")}>7 gün blok</Button>
                        {decide(`rban:${row.id}`, (
                          <Button variant="danger" onClick={() => resolve(row, "ban", "permanent")}>Bloklansın</Button>
                        )) || <Button variant="danger" onClick={() => setAsk(`rban:${row.id}`)}>Həmişəlik blok</Button>}
                      </div>
                    ) : null}
                  </article>
                )) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </AdminGuard>
  );
}

function labelFor(type) {
  if (type === "post") return "Post";
  if (type === "reel") return "Reel";
  if (type === "comment") return "Şərh";
  if (type === "story") return "Hekayə";
  if (type === "user") return "Hesab";
  return type;
}

function statusLabel(status) {
  if (status === "open") return "açıq";
  if (status === "dismissed") return "rədd";
  if (status === "remove") return "silindi";
  if (status === "ban") return "blok";
  return status;
}
