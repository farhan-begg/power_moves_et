import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";

import AlreadyAuthRedirect from "./components/AlreadyAuthRedirect";
import ProtectedRoute from "./components/ProtectRoute";

export default function App() {
  return (
    <Router>
      <Routes>
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
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}
