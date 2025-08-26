// src/api/http.ts
import axios from "axios";

export const http = axios.create({
  baseURL: "http://localhost:5000",
});

// Small helper to add Authorization header
export const auth = (token?: string) =>
  token ? { headers: { Authorization: `Bearer ${token}` } } : {};
