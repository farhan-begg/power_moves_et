import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../app/store";
import { register as registerThunk } from "../features/auth/authSlice";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import hero from "../assets/images/logo.png";


export default function Register() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading, error } = useSelector((s: RootState) => s.auth);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }
    const result = await dispatch(registerThunk({ email, password, name }));
    if (registerThunk.fulfilled.match(result)) {
      navigate("/dashboard");
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your calm money OS."
      imageUrl={hero}
  fit="cover"          // ← no crop
  imagePosition="center" 
    maxVisualWidth="1440px"  
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {(localError || error) && (
          <div className="text-sm text-rose-300 bg-rose-500/10 ring-1 ring-rose-400/20 rounded-lg p-3">
            {localError || error}
          </div>
        )}

        <div>
          <label className="block text-xs text-white/70 mb-1">Full name</label>
          <input
            type="text"
            required
            placeholder="Ava Martinez"
            className="w-full rounded-lg bg-white/10 ring-1 ring-white/10 px-3 py-2.5 text-sm placeholder-white/40 focus:outline-none focus:ring-emerald-400/40 focus:bg-white/[0.12]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

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
              autoComplete="new-password"
              placeholder="At least 8 characters"
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
          <p className="mt-1 text-[11px] text-white/50">
            Use 8+ characters with a mix of letters & numbers.
          </p>
        </div>

        <div>
          <label className="block text-xs text-white/70 mb-1">Confirm password</label>
          <div className="relative">
            <input
              type={showPw2 ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="Re-enter password"
              className="w-full rounded-lg bg-white/10 ring-1 ring-white/10 px-3 py-2.5 pr-10 text-sm placeholder-white/40 focus:outline-none focus:ring-emerald-400/40 focus:bg-white/[0.12]"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw2((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/10"
              aria-label={showPw2 ? "Hide password" : "Show password"}
            >
              {showPw2 ? <EyeSlashIcon className="h-5 w-5 text-white/70" /> : <EyeIcon className="h-5 w-5 text-white/70" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium ring-1 ring-emerald-400/30 bg-emerald-500/20 hover:bg-emerald-500/25 text-emerald-200 disabled:opacity-60 disabled:hover:bg-emerald-500/20"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        {/* Optional OAuth placeholders */}
        <div className="relative pt-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] text-white/50">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs hover:bg-white/10">
              Sign up with Google
            </button>
            <button type="button" className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs hover:bg-white/10">
              Sign up with Apple
            </button>
          </div>
        </div>

        <p className="text-xs text-white/60">
          Already have an account?{" "}
          <Link to="/login" className="text-emerald-300 hover:text-emerald-200">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
