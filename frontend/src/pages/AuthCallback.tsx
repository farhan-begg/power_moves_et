// frontend/src/pages/AuthCallback.tsx
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../app/store";
import { setToken } from "../features/auth/authSlice";
import LogoLoader from "../components/common/LogoLoader";

export default function AuthCallback() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const error = searchParams.get("error");

  useEffect(() => {
    if (error) {
      console.error("OAuth error:", error);
      navigate("/login?error=" + encodeURIComponent(error), { replace: true });
      return;
    }

    if (token) {
      // Store token in Redux and localStorage
      dispatch(setToken(token));
      
      // Redirect to dashboard (user info will be fetched there)
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/login?error=no_token", { replace: true });
    }
  }, [token, error, navigate, dispatch]);

  return <LogoLoader show />;
}
