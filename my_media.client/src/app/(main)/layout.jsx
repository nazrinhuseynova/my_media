import { Navigate, Outlet } from "react-router-dom";
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

export default function MainLayout() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const setCreateOpen = useAppStore((s) => s.setCreateOpen);
  if (loading) return <div className="auth-wrap"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className="topbar">
          <span className="brand">Pulse</span>
          <button type="button" className="topbar-share" onClick={() => setCreateOpen(true)}>Paylaş</button>
        </header>
        <Notice />
        <Outlet />
      </main>
      <BottomNav />
      <CreatePostModal />
      <ShareModal />
      <StoryUploader />
      <CreateReelModal />
      <AccountSheet />
    </div>
  );
}
