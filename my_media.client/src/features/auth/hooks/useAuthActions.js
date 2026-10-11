import { useAuthStore } from "../store/useAuthStore";
import { authApi } from "../services/authApi";

export function useAuthActions() {
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const social = useAuthStore((s) => s.social);
  return { login, logout, social, register: authApi.register };
}
