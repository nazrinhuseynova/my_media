import { Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import BottomNav from "../../components/layout/BottomNav";
import { useAuthStore } from "../../features/auth/store/useAuthStore";
import { useAppStore } from "../../stores/useAppStore";
import CreatePostModal from "../../features/post/components/CreatePostModal";
import ShareModal from "../../features/post/components/ShareModal";
import StoryUploader from "../../features/story/components/StoryUploader";
import CreateReelModal from "../../features/reels/components/CreateReelModal";
import Notice from "../../components/ui/Notice";
import AccountSheet from "../../features/auth/components/AccountSheet";
import FeatureTour from "../../features/tour/FeatureTour";
import HelpBot from "../../features/help/HelpBot";

function isConsumerPath(path) {
  if (path === "/" || path === "/explore" || path === "/search" || path === "/reels" || path === "/notifications" || path === "/saved" || path === "/liked" || path === "/archive" || path === "/drafts") return true;
  return path === "/direct" || path.startsWith("/direct/");
}

export default function MainLayout() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const setCreateOpen = useAppStore((s) => s.setCreateOpen);
  const location = useLocation();
  const admin = user?.role === "admin";
  if (loading) return <div className="auth-wrap"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!admin && !user.language) return <Navigate to="/welcome" replace />;
  if (admin && isConsumerPath(location.pathname)) return <Navigate to="/admin" replace />;
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className="topbar">
          <span className="brand" data-keep>Pulse</span>
          {admin ? <span className="muted">Nəzarət</span> : <button type="button" className="topbar-share" data-tour="share" onClick={() => setCreateOpen(true)}>Paylaş</button>}
        </header>
        <Notice />
        <Outlet />
      </main>
      <BottomNav />
      {admin ? null : <CreatePostModal />}
      {admin ? null : <ShareModal />}
      {admin ? null : <StoryUploader />}
      {admin ? null : <CreateReelModal />}
      {admin ? null : <AccountSheet />}
      {admin ? null : <FeatureTour />}
      {admin ? null : <HelpBot />}
    </div>
  );
}
