import { http, auth } from "./http";

export const registerUser = async (name: string, email: string, password: string) => {
  const { data } = await http.post("/auth/register", { name, email, password });
  return data;
};

export const loginUser = async (email: string, password: string) => {
  const { data } = await http.post("/auth/login", { email, password });
  return data;
};

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  plaidAccessToken?: { content: string; iv: string; tag: string } | null;
}

export const fetchUserInfo = async (token: string): Promise<UserInfo> => {
  const { data } = await http.get<UserInfo>("/api/auth/me", auth(token));
  return data;
};
