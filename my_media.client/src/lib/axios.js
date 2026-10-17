import axios from "axios";
import { dropActiveAccount, touchSession } from "../features/auth/accountVault";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5017";

const http = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

function plainMessage(message) {
  const text = String(message || "");
  if (!text) return text;
  if (/email serveri ayarlanmayıb|təsdiq kodu yalnız emailə|kod göndərilmədi/i.test(text)) return "Kodu göndərmək alınmadı. Bir az sonra yenidən cəhd et";
  if (/clientid|appsettings/i.test(text)) return "Bu üsulla daxil olmaq hazırda mümkün deyil";
  if (/cloudinary/i.test(text)) return "Fayl yüklənmədi";
  if (/google (təsdiq tokeni|tokeni|açarları)/i.test(text)) return "Google ilə daxil olmaq alınmadı";
  if (/apple (təsdiq tokeni|tokeni|açarları)/i.test(text)) return "Apple ilə daxil olmaq alınmadı";
  if (/facebook (təsdiq tokeni|tokeni|açarları)/i.test(text)) return "Facebook ilə daxil olmaq alınmadı";
  if (/tokenin içində email/i.test(text)) return "Bu hesabın emaili görünmür";
  if (/exception|stack trace|smtp|jwt |object reference|sql exception/i.test(text)) return "Bu əməliyyat alınmadı";
  return text;
}

const AUTH_OPEN = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/apple",
  "/api/auth/facebook",
  "/api/auth/github",
  "/api/auth/microsoft",
  "/api/auth/verify-otp",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-otp",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/providers",
];

http.interceptors.request.use((config) => {
  if (config.skipAuth) {
    delete config.headers?.Authorization;
    return config;
  }
  const token = localStorage.getItem("pulse_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const raw = error.response?.data?.message;
    if (typeof raw === "string" && error.response?.data) {
      error.response.data.message = plainMessage(raw);
    }
    const status = error.response?.status;
    const url = error.config?.url || "";
    const openAuth = AUTH_OPEN.some((path) => url.includes(path));
    const config = error.config;
    if (status === 401 && config && !config._retry && !openAuth) {
      const refresh = localStorage.getItem("pulse_refresh");
      if (refresh) {
        config._retry = true;
        try {
          const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken: refresh });
          touchSession(refresh, data.token, data.refreshToken, data.user);
          config.headers.Authorization = `Bearer ${data.token}`;
          return http(config);
        } catch {
        }
      }
    }
    if (status === 401 && !openAuth) {
      const next = dropActiveAccount();
      if (next) {
        localStorage.setItem("pulse_token", next.token);
        localStorage.setItem("pulse_refresh", next.refreshToken);
        try { sessionStorage.setItem("pulse_skip_intro", "1"); } catch { /* ignore */ }
        window.location.assign(next.role === "admin" ? "/admin" : "/");
        return Promise.reject(error);
      }
      import("../features/auth/store/useAuthStore").then(({ useAuthStore }) => {
        useAuthStore.setState({ user: null, loading: false });
      });
      let introPlaying = false;
      try {
        introPlaying = sessionStorage.getItem("pulse_intro_playing") === "1";
      } catch {
        /* ignore */
      }
      const path = window.location.pathname;
      // Intro gedərkən /login-ə atma — intro bitəndə App özü /login açır
      if (!introPlaying && !path.startsWith("/login") && !path.startsWith("/register") && !path.startsWith("/otp") && !path.startsWith("/forgot")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default http;
