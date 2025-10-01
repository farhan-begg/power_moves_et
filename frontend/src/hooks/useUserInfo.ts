import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  plaidAccessToken?: { content: string; iv: string; tag: string } | null;
}

export const useUserInfo = (token: string | null) =>
  useQuery<UserInfo>({
    queryKey: ["userInfo"],
    queryFn: async () => {
      const { data } = await axios.get<UserInfo>("auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
    enabled: !!token,
  });
