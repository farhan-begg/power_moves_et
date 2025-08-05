import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../app/store";
import { register } from "../features/auth/authSlice";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state: RootState) => state.auth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(register({ name, email, password }));
    if (register.fulfilled.match(result)) {
      navigate("/dashboard"); // ✅ Auto-login after register
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-900 to-slate-700">
      <form
        onSubmit={handleSubmit}
        className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl shadow-2xl w-96"
      >
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          Create Account
        </h2>
        {error && <p className="text-red-400 mb-4">{error}</p>}
        <input
          type="text"
          placeholder="Name"
          className="w-full p-3 rounded mb-4 bg-white/20 text-white placeholder-gray-300 focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          placeholder="Email"
          className="w-full p-3 rounded mb-4 bg-white/20 text-white placeholder-gray-300 focus:outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full p-3 rounded mb-6 bg-white/20 text-white placeholder-gray-300 focus:outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-green-400 to-emerald-600 text-white font-semibold py-3 rounded-lg hover:opacity-90"
        >
          {loading ? "Registering..." : "Register"}
        </button>
      </form>
    </div>
  );
}
