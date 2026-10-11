import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../auth/store/useAuthStore";

export default function AdminGuard({ children }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return children;
}
