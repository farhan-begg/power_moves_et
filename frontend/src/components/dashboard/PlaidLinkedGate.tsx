// src/components/dashboard/PlaidLinkedGate.tsx
import React, { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { RootState, AppDispatch } from "../../app/store";
import { logout } from "../../features/auth/authSlice";
import PlaidAutoLink from "../widgets/PlaidAutoLink";
import LogoLoader from "../common/LogoLoader";

import { fetchUserInfo, type UserInfo } from "../../api/auth";

// Helper function to clear all auth data
const clearAuthData = () => {
  // Clear localStorage
  localStorage.removeItem("token");
  
  // Clear all cookies (if any exist)
  document.cookie.split(";").forEach((c) => {
    const eqPos = c.indexOf("=");
    const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
    // Clear cookie by setting it to expire in the past
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
  });
};

export default function PlaidLinkedGate({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const reduxToken = useSelector((s: RootState) => s.auth.token);
  const token = reduxToken || localStorage.getItem("token") || null;

  const { data, isLoading, isError } = useQuery<UserInfo>({
    queryKey: ["userInfo"],
    enabled: !!token,
    queryFn: () => fetchUserInfo(token!),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false, // Don't retry on failure
  });

  // Handle user load failure
  useEffect(() => {
    if (isError || (!isLoading && token && !data)) {
      // Clear all auth data
      clearAuthData();
      // Dispatch logout to clear Redux state
      dispatch(logout());
      // Redirect to login
      navigate("/login", { replace: true });
    }
  }, [isError, isLoading, token, data, dispatch, navigate]);

  if (!token) return <LogoLoader show />;

  if (isLoading) return <LogoLoader show />;

  if (isError || !data) {
    // This will be handled by useEffect, but show loading while redirecting
    return <LogoLoader show />;
  }

  // ✅ Not linked => show link screen
  if ((data as any).banksConnected === 0) {
    return <PlaidAutoLink onSuccess={() => {}} />;
  }

  // ✅ Linked => render dashboard
  return <>{children}</>;
}
