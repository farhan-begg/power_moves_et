// src/api/auth.ts
import axios from "axios";

const API_URL = "http://localhost:5000/api/auth";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  plaidAccessToken?: { content: string; iv: string; tag: string } | null;
}

export const registerUser = async (name: string, email: string, password: string) => {
  const response = await axios.post(`${API_URL}/register`, { name, email, password });
  return response.data;
};

export const loginUser = async (email: string, password: string) => {
  const response = await axios.post(`${API_URL}/login`, { email, password });
  return response.data;
};

// Fetch current user (including plaidAccessToken) for `/me`
export const fetchUserInfo = async (token: string): Promise<UserInfo> => {
  const { data } = await axios.get<UserInfo>(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
};
