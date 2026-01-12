// src/App.tsx
import { useEffect, Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AlreadyAuthRedirect from "./components/auth/AlreadyAuthRedirect";
import ProtectedRoute from "./components/auth/ProtectRoute";
import PlaidLinkedGate from "./components/dashboard/PlaidLinkedGate";
import LogoLoader from "./components/common/LogoLoader";
import { useAppSelector } from "./hooks/hooks";

// ✅ Mobile Performance: Lazy load heavy pages for code splitting
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Landing = lazy(() => import("./pages/Landing"));
const Settings = lazy(() => import("./pages/Settings"));
const SettingsCategories = lazy(() => import("./settings/SettingsCategories"));
const SettingsWidgets = lazy(() => import("./pages/SettingsWidgets"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

function ThemeSync() {
  const themeMode = useAppSelector((s) => s.theme.mode);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  return null;
}

// ✅ Mobile Performance: Loading fallback component
const PageLoader = () => <LogoLoader show />;

export default function App() {
  return (
    <Router>
      <ThemeSync />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/settings/widgets"
            element={
              <ProtectedRoute>
                <SettingsWidgets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/categories"
            element={
              <ProtectedRoute>
                <SettingsCategories />
              </ProtectedRoute>
            }
          />
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
      </Suspense>
    </Router>
  );
}
