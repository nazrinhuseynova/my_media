import axios from "axios";

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
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";
    const openAuth = AUTH_OPEN.some((path) => url.includes(path));
    if (status === 401 && !openAuth) {
      localStorage.removeItem("pulse_token");
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
