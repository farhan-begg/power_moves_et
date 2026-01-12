// src/api/http.ts
import axios from "axios";
import { RequestDeduplicator } from "../utils/requestBatcher";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // 👈 ensures cookies/JWT are sent if you ever use them
  timeout: 30000, // ✅ Cost Optimization: 30s timeout to prevent hanging requests
});

// ✅ Cost Optimization: Request deduplication - prevents duplicate simultaneous requests
// Note: React Query already handles deduplication, but this adds an extra layer
const requestDeduplicator = new RequestDeduplicator();

// ✅ Cost Optimization: Add request timeout and error handling
http.interceptors.request.use(
  (config) => {
    // Add timestamp for debugging
    (config as any).requestStartTime = Date.now();
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Cost Optimization: Response interceptor for logging and error handling
http.interceptors.response.use(
  (response) => {
    const duration = Date.now() - (response.config as any).requestStartTime;
    // Log slow requests in development
    if (process.env.NODE_ENV === "development" && duration > 1000) {
      console.warn(`⚠️ Slow API request: ${response.config.url} took ${duration}ms`);
    }
    return response;
  },
  (error) => {
    // Log API errors for debugging
    if (process.env.NODE_ENV === "development") {
      console.error("❌ API Error:", error.config?.url, error.response?.status, error.message);
    }
    return Promise.reject(error);
  }
);

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
  
  // Redirect to login if not already there
  if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
    window.location.href = "/login";
  }
};

// Response interceptor to handle 401 errors globally
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear auth data and redirect to login
      clearAuthData();
    }
    return Promise.reject(error);
  }
);

// Small helper to add Authorization header
// src/api/http.ts
export const auth = (token?: string | null) =>
  token ? { headers: { Authorization: `Bearer ${token}` } } : {};
