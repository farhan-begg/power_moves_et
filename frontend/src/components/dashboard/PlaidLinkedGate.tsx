// src/components/dashboard/PlaidLinkedGate.tsx
import React from "react";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";

import { RootState } from "../../app/store";
import PlaidAutoLink from "../widgets/PlaidAutoLink";
import LogoLoader from "../common/LogoLoader";

import { fetchUserInfo, type UserInfo } from "../../api/auth";

export default function PlaidLinkedGate({ children }: { children: React.ReactNode }) {
  const reduxToken = useSelector((s: RootState) => s.auth.token);
  const token = reduxToken || localStorage.getItem("token") || null;

  const { data, isLoading, isError } = useQuery<UserInfo>({
    queryKey: ["userInfo"],
    enabled: !!token,
    queryFn: () => fetchUserInfo(token!),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  if (!token) return <LogoLoader show />;

  if (isLoading) return <LogoLoader show />;

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-rose-300">
        Failed to load user
      </div>
    );
  }

  // ✅ Not linked => show link screen
  if ((data as any).banksConnected === 0) {
    return <PlaidAutoLink onSuccess={() => {}} />;
  }

  // ✅ Linked => render dashboard
  return <>{children}</>;
}
