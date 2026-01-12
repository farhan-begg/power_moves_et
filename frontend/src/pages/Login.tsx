import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../app/store";
import { login } from "../features/auth/authSlice";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import hero from "../assets/images/logo.png";



export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state: RootState) => state.auth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login({ email, password }));
    if (login.fulfilled.match(result)) {
      navigate("/dashboard");
    }
  };

  return (
 <AuthLayout
  title="Welcome back"
  subtitle="Log in to your control center."
  imageUrl={hero}
  fit="cover"          // ← no crop
  imagePosition="center" 
    maxVisualWidth="1440px"  
>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-rose-300 bg-rose-500/10 ring-1 ring-rose-400/20 rounded-lg p-3">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs text-white/70 mb-1">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@domain.com"
            className="w-full rounded-lg bg-white/10 ring-1 ring-white/10 px-3 py-2.5 text-sm placeholder-white/40 focus:outline-none focus:ring-emerald-400/40 focus:bg-white/[0.12]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs text-white/70 mb-1">Password</label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-lg bg-white/10 ring-1 ring-white/10 px-3 py-2.5 pr-10 text-sm placeholder-white/40 focus:outline-none focus:ring-emerald-400/40 focus:bg-white/[0.12]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/10"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeSlashIcon className="h-5 w-5 text-white/70" /> : <EyeIcon className="h-5 w-5 text-white/70" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <label className="inline-flex items-center gap-2 select-none">
            <input 
              type="checkbox" 
              className="accent-emerald-400 rounded border-white/20 focus:ring-2 focus:ring-emerald-400/40" 
            />
            <span className="text-white/70">Remember me</span>
          </label>
          <Link to="/forgot" className="text-emerald-300 hover:text-emerald-200">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium ring-1 ring-emerald-400/30 bg-emerald-500/20 hover:bg-emerald-500/25 text-emerald-200 disabled:opacity-60 disabled:hover:bg-emerald-500/20"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        <p className="text-xs text-white/60">
          New here?{" "}
          <Link to="/register" className="text-emerald-300 hover:text-emerald-200">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
