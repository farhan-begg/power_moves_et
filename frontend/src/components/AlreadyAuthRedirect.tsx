import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../app/store";
import { ReactNode } from "react";

export default function AlreadyAuthRedirect({ children }: { children: ReactNode }) {
  const token = useSelector((state: RootState) => state.auth.token);

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
