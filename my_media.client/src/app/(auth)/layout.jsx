import { Navigate, Outlet, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../features/auth/store/useAuthStore";

export default function AuthLayout() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const [params] = useSearchParams();
  const adding = params.get("add") === "1";
  if (loading) return <div className="auth-wrap"><div className="spinner" /></div>;
  if (user?.role === "admin" && adding) return <Navigate to="/admin" replace />;
  if (user && !adding) return <Navigate to="/" replace />;
  return <Outlet />;
}
