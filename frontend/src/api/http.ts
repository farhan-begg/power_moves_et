// src/api/http.ts
import axios from "axios";

export const http = axios.create({
  baseURL: "/", // CRA proxy will forward /api/* to 5000 in dev
});

// Small helper to add Authorization header
export const auth = (token?: string) =>
  token ? { headers: { Authorization: `Bearer ${token}` } } : {};
