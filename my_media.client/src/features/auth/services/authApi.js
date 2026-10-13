import { api } from "../../../services/api";

export function authMessage(err, fallback) {
  if (!err?.response) return "Serverə qoşulmaq alınmadı";
  return err.response.data?.message || fallback;
}

export const authApi = {
  register: (body) => api.post("/api/auth/register", body),
  verifyOtp: (body) => api.post("/api/auth/verify-otp", body),
  resendOtp: (body) => api.post("/api/auth/resend-otp", body),
  forgot: (body) => api.post("/api/auth/forgot-password", body),
  reset: (body) => api.post("/api/auth/reset-password", body),
  changePassword: (body) => api.post("/api/auth/change-password", body),
  deactivate: () => api.post("/api/auth/deactivate"),
  removeAccount: () => api.delete("/api/auth/account"),
  sessions: () => api.get("/api/auth/sessions"),
  revokeSession: (id) => api.delete(`/api/auth/sessions/${id}`),
  revokeOtherSessions: () => api.post("/api/auth/sessions/revoke-others"),
};
