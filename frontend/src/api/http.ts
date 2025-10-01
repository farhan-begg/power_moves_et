// src/api/http.ts
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // 👈 ensures cookies/JWT are sent if you ever use them
});

// Small helper to add Authorization header
export const auth = (token?: string) =>
  token ? { headers: { Authorization: `Bearer ${token}` } } : {};
