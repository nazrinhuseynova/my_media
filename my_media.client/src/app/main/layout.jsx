import { Navigate, Outlet } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import BottomNav from "../../components/layout/BottomNav";
import { useAuthStore } from "../../features/auth/store/useAuthStore";
import CreatePostModal from "../../features/post/components/CreatePostModal";
import ShareModal from "../../features/post/components/ShareModal";
import StoryUploader from "../../features/story/components/StoryUploader";
import CreateReelModal from "../../features/reels/components/CreateReelModal";

export default function MainLayout() {
    const user = useAuthStore((s) => s.user);
    const loading = useAuthStore((s) => s.loading);
    if (loading) return <div className="auth-wrap"><div className="spinner" /></div>;
    if (!user) return <Navigate to="/login" replace />;
    return (
        <div className="app-shell">
            <Sidebar />
            <main className="app-main">
                <Outlet />
            </main>
            <BottomNav />
            <CreatePostModal />
            <ShareModal />
            <StoryUploader />
            <CreateReelModal />
        </div>
    );
}