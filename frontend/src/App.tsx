// src/App.tsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import SettingsCategories from "./settings/SettingsCategories";

import AlreadyAuthRedirect from "./components/auth/AlreadyAuthRedirect";
import ProtectedRoute from "./components/auth/ProtectRoute";
import PlaidLinkedGate from "./components/dashboard/PlaidLinkedGate";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/settings/categories" element={<SettingsCategories />} />

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
