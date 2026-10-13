import axios from "axios";
import { dropActiveAccount, touchSession } from "../features/auth/accountVault";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5017";

const http = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

const AUTH_OPEN = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/apple",
  "/api/auth/verify-otp",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-otp",
  "/api/auth/refresh",
  "/api/auth/logout",
];

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("pulse_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  async (error) => {
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
        window.location.assign("/");
        return Promise.reject(error);
      }
      import("../features/auth/store/useAuthStore").then(({ useAuthStore }) => {
        useAuthStore.setState({ user: null, loading: false });
      });
      const path = window.location.pathname;
      if (!path.startsWith("/login") && !path.startsWith("/register") && !path.startsWith("/otp") && !path.startsWith("/forgot")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default http;
