import { http, auth } from "./http";

export const registerUser = async (name: string, email: string, password: string) => {
  const { data } = await http.post("/auth/register", { name, email, password });
  return data;
};

export const loginUser = async (email: string, password: string) => {
  const { data } = await http.post("/auth/login", { email, password });
  return data;
};

// ✅ UPDATED to match backend /auth/me response
export interface UserInfo {
  id: string;
  name: string;
  email: string;

  // returned by /auth/me
  banksConnected: number;
  primaryItemId: string | null;
  primaryInstitutionName: string | null;

  // keep this ONLY if your backend still returns it somewhere else (optional)
  plaidAccessToken?: { content: string; iv: string; tag: string } | null;
}

export const fetchUserInfo = async (token: string): Promise<UserInfo> => {
  const { data } = await http.get<UserInfo>("/auth/me", auth(token));
  return data;
};
