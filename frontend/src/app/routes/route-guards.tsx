import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../../features/auth/auth-store";

export function ProtectedRoute({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const { session } = useAuth();

  if (!session.isAuthenticated) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  return <>{children}</>;
}
