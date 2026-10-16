import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import "./styles/ui.css";
import IntroSplash from "./features/intro/IntroSplash";
import WelcomePage from "./features/intro/WelcomePage";
import { useAuthStore } from "./features/auth/store/useAuthStore";
import { useNotificationStore } from "./stores/useNotificationStore";
import { useUiPrefs } from "./stores/useUiPrefs";
import { connectSocket, onSocket } from "./lib/socket";
import AuthLayout from "./app/(auth)/layout";
import MainLayout from "./app/(main)/layout";
import LoginPage from "./app/(auth)/login/page";
import RegisterPage from "./app/(auth)/register/page";
import OtpPage from "./app/(auth)/otp/page";
import ForgotPage from "./app/(auth)/forgot-password/page";
import ResetPasswordPage from "./app/(auth)/reset-password/page";
import FeedPage from "./app/(main)/feed/page";
import ExplorePage from "./app/(main)/explore/page";
import SearchPage from "./app/(main)/search/page";
import ReelsPage from "./app/(main)/reels/page";
import DirectPage from "./app/(main)/direct/page";
import ProfilePage from "./app/(main)/profile/page";
import PostPage from "./app/(main)/post/page";
import NotificationsPage from "./app/(main)/notifications/page";
import SettingsPage from "./app/(main)/settings/page";
import SavedPage from "./app/(main)/saved/page";
import LikedPage from "./app/(main)/liked/page";
import AdminPage from "./app/(main)/admin/page";
import HashtagPage from "./app/(main)/hashtag/page";
import LocationPage from "./app/(main)/location/page";
import ShelfPage from "./app/(main)/shelf/page";

const SKIP_INTRO_KEY = "pulse_skip_intro";

/** Yalnız giriş/qeydiyyat/hesab dəyişimi sonrası reload-da intro-nu keç. Yeniləmədə göstər. */
function shouldShowIntro() {
    try {
        if (sessionStorage.getItem(SKIP_INTRO_KEY) === "1") {
            sessionStorage.removeItem(SKIP_INTRO_KEY);
            return false;
        }
    } catch {
        /* ignore */
    }
    return true;
}

export default function App() {
    const [intro, setIntro] = useState(shouldShowIntro);
    const bootstrap = useAuthStore((s) => s.bootstrap);
    const user = useAuthStore((s) => s.user);
    const loadNotes = useNotificationStore((s) => s.load);

    // Giriş/qeydiyyatdan sonra (client navigate) intro-nu bağla
    useEffect(() => {
        if (user && intro) setIntro(false);
    }, [user, intro]);

    // Welcome/intro zamanı URL-də /login olmasın — yalnız login formasına keçəndə
    useEffect(() => {
        if (!intro) return;
        const { pathname, search } = window.location;
        if (pathname === "/login" && !new URLSearchParams(search).get("add")) {
            window.history.replaceState(null, "", "/");
        }
    }, [intro]);

    useEffect(() => {
        bootstrap();
    }, [bootstrap]);

    useEffect(() => {
        if (!user) return;
        loadNotes();
        connectSocket();
        return onSocket("notify", (n) => {
            if (useUiPrefs.getState().pauseNotifications) return;
            useNotificationStore.setState((s) => {
                if (s.items.some((x) => x.id === n.id)) return s;
                return { items: [{ ...n, read: false }, ...s.items] };
            });
        });
    }, [user, loadNotes]);

    return (
        <>
        {intro ? <IntroSplash onDone={() => setIntro(false)} /> : (
        <Routes>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/otp" element={<OtpPage />} />
                <Route path="/forgot-password" element={<ForgotPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>
            <Route element={<MainLayout />}>
                <Route path="/" element={<FeedPage />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/reels" element={<ReelsPage />} />
                <Route path="/direct" element={<DirectPage />} />
                <Route path="/direct/:id" element={<DirectPage />} />
                <Route path="/profile/:username" element={<ProfilePage />} />
                <Route path="/p/:id" element={<PostPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/liked" element={<LikedPage />} />
                <Route path="/saved" element={<SavedPage />} />
                <Route path="/archive" element={<ShelfPage />} />
                <Route path="/drafts" element={<ShelfPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/hashtag/:tag" element={<HashtagPage />} />
                <Route path="/location/:name" element={<LocationPage />} />
            </Route>
        </Routes>
        )}
        </>
    );
}
