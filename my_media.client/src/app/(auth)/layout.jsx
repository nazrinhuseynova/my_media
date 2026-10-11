import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../features/auth/store/useAuthStore";

export default function AuthLayout() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  if (loading) return <div className="auth-wrap"><div className="spinner" /></div>;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
