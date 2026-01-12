// src/App.tsx
import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import Settings from "./pages/Settings";
import SettingsCategories from "./settings/SettingsCategories";

import AlreadyAuthRedirect from "./components/auth/AlreadyAuthRedirect";
import ProtectedRoute from "./components/auth/ProtectRoute";
import PlaidLinkedGate from "./components/dashboard/PlaidLinkedGate";

import { useAppSelector } from "./hooks/hooks";

function ThemeSync() {
  const themeMode = useAppSelector((s) => s.theme.mode);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  return null;
}

export default function App() {
  return (
    <Router>
      <ThemeSync />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/settings/categories" element={<SettingsCategories />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route
          path="/login"
          element={
            <AlreadyAuthRedirect>
              <Login />
            </AlreadyAuthRedirect>
          }
        />

        <Route
          path="/register"
          element={
            <AlreadyAuthRedirect>
              <Register />
            </AlreadyAuthRedirect>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <PlaidLinkedGate>
                <Dashboard />
              </PlaidLinkedGate>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}
