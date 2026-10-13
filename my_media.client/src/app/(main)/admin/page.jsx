import { useEffect, useState } from "react";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../features/auth/store/useAuthStore";
import Button from "../../../components/ui/Button";
import AdminGuard from "../../../features/admin/components/AdminGuard";
import { notify } from "../../../stores/useNoticeStore";

export default function AdminPage() {
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    if (me?.role !== "admin") return;
    api.get("/api/admin/stats").then(setStats);
    api.get("/api/admin/users").then(setUsers);
    api.get("/api/admin/posts").then(setPosts);
    api.get("/api/admin/reports").then(setReports);
  }, [me]);

  return (
    <AdminGuard>
    <div className="page">
      <h2>Admin panel</h2>
      <div className="admin-tabs">
        <Button variant={tab === "stats" ? "primary" : "ghost"} onClick={() => setTab("stats")}>Statistika</Button>
        <Button variant={tab === "users" ? "primary" : "ghost"} onClick={() => setTab("users")}>İstifadəçilər</Button>
        <Button variant={tab === "posts" ? "primary" : "ghost"} onClick={() => setTab("posts")}>Postlar</Button>
        <Button variant={tab === "reports" ? "primary" : "ghost"} onClick={() => setTab("reports")}>Şikayətlər</Button>
      </div>
      {tab === "stats" && stats ? (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="card" style={{ padding: 16, minWidth: 140 }}><div className="muted">{k}</div><strong>{v}</strong></div>
          ))}
        </div>
      ) : null}
      {tab === "users" ? (
        <div className="table-scroll"><table className="admin-table">
          <thead><tr><th>Username</th><th>Rol</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.isBanned ? "dayandırılıb" : u.isActive ? "aktiv" : "deaktiv"}</td>
                <td><Button variant="danger" onClick={async () => { const n = await api.post(`/api/admin/users/${u.id}/ban`); setUsers(users.map((x) => x.id === n.id ? n : x)); notify(n.isBanned ? "Hesab bloklandı" : "Hesab açıldı"); }}>{u.isBanned ? "Aç" : "Blokla"}</Button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : null}
      {tab === "posts" ? (
        <div className="table-scroll"><table className="admin-table">
          <thead><tr><th>Caption</th><th>User</th><th></th></tr></thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td>{p.caption}</td>
                <td>{p.user?.username}</td>
                <td><Button variant="danger" onClick={async () => { await api.delete(`/api/posts/${p.id}`); setPosts(posts.filter((x) => x.id !== p.id)); notify("Paylaşım silindi"); }}>Sil</Button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : null}
      {tab === "reports" ? (
        <div className="table-scroll"><table className="admin-table">
          <thead><tr><th>Səbəb</th><th>Tip</th><th>Hədəf</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.reason}</td>
                <td>{r.targetType}</td>
                <td>{r.targetId}</td>
                <td>{r.status}</td>
                <td>
                  {r.status === "open" ? (
                    <>
                      <Button variant="ghost" onClick={async () => {
                        const n = await api.post(`/api/admin/reports/${r.id}/resolve`, { action: "dismissed" });
                        setReports(reports.map((x) => x.id === n.id ? { ...x, status: n.status } : x));
                        notify("Şikayət rədd edildi");
                      }}>Rədd et</Button>
                      <Button variant="danger" onClick={async () => {
                        const n = await api.post(`/api/admin/reports/${r.id}/resolve`, { action: "remove" });
                        setReports(reports.map((x) => x.id === n.id ? { ...x, status: n.status } : x));
                        notify("Hədəf silindi");
                      }}>Sil</Button>
                      <Button variant="danger" onClick={async () => {
                        const n = await api.post(`/api/admin/reports/${r.id}/resolve`, { action: "ban" });
                        setReports(reports.map((x) => x.id === n.id ? { ...x, status: n.status } : x));
                        notify("Hesab bloklandı");
                      }}>Ban</Button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : null}
    </div>
    </AdminGuard>
  );
}
