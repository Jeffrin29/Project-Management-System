"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { authApi } from "../../lib/api";
import Image from "next/image";

// ── Shared input class — dark, consistent across all fields ───────────────────
const inputCls =
  "w-full mt-1 p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors";

// ── Password input with show/hide toggle ──────────────────────────────────────
function PasswordInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} pr-12`}
        autoComplete="off"
        style={{ WebkitTextSecurity: show ? "none" : undefined } as React.CSSProperties}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// ── Main Auth Page ────────────────────────────────────────────────────────────
export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);

  // ── Login state ──
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Signup state ──
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);

  // ── Login handler (unchanged logic) ──
  async function handleLogin() {
    setLoginError("");
    if (!email.trim() || !password.trim()) {
      return setLoginError("Please enter your email and password.");
    }
    try {
      setLoginLoading(true);
      const res = await authApi.login(email, password);
      console.log("LOGIN RESPONSE:", res);
      if (!res || !res.token) throw new Error("No token received from server");
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Login Error:", err);
      setLoginError(err.message || "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  // ── Signup handler ──
  async function handleSignup() {
    setSignupError("");

    // Validation
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword.trim() || !signupConfirm.trim()) {
      return setSignupError("All fields are required.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signupEmail.trim())) {
      return setSignupError("Please enter a valid email address.");
    }
    if (signupPassword.length < 6) {
      return setSignupError("Password must be at least 6 characters.");
    }
    if (signupPassword !== signupConfirm) {
      return setSignupError("Passwords do not match.");
    }

    try {
      setSignupLoading(true);
      await authApi.register({
        name: signupName.trim(),
        email: signupEmail.trim().toLowerCase(),
        password: signupPassword,
        role: "employee",
        createdAt: new Date().toISOString(),
      });
      setSignupSuccess(true);
      // After 2s show success, redirect to login
      setTimeout(() => {
        setSignupSuccess(false);
        setSignupName("");
        setSignupEmail("");
        setSignupPassword("");
        setSignupConfirm("");
        setIsLogin(true);
      }, 2000);
    } catch (err: any) {
      const msg = (err.message || "Registration failed").toLowerCase();
      if (msg.includes("exist") || msg.includes("duplicate") || msg.includes("already")) {
        setSignupError("An account with this email already exists.");
      } else {
        setSignupError(err.message || "Registration failed. Please try again.");
      }
    } finally {
      setSignupLoading(false);
    }
  }

  return (
    /* Same black page background */
    <div className="min-h-screen bg-black flex items-center justify-center px-4">

      {/* Same card style — exactly unchanged */}
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl p-10 rounded-xl border border-zinc-800 shadow-2xl">

        <AnimatePresence mode="wait">

          {/* ── LOGIN ── */}
          {isLogin ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center justify-center gap-3">
                <Image
                  src="/images/logo.png"
                  alt="LANSUB Logo"
                  width={36}
                  height={36}
                  className="object-contain"
                />
                <h1 className="text-3xl font-semibold text-white">
                  LANSUB
                </h1>
              </div>
              <p className="text-gray-400 text-center text-sm mt-1 mb-8">
                Login to your account
              </p>

              {/* Error */}
              {loginError && (
                <p className="text-red-500 text-sm mb-4 text-center bg-red-500/10 border border-red-500/20 rounded-lg py-2 px-3">
                  {loginError}
                </p>
              )}

              {/* Email */}
              <div className="mb-4">
                <label className="text-sm text-gray-400">Email</label>
                <input
                  type="email"
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className={inputCls}
                />
              </div>

              {/* Password with eye toggle */}
              <div className="mb-6">
                <label className="text-sm text-gray-400">Password</label>
                <PasswordInput
                  placeholder="Enter password"
                  value={password}
                  onChange={setPassword}
                />
              </div>

              {/* Premium blue login button */}
              <button
                id="login-btn"
                onClick={handleLogin}
                disabled={loginLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loginLoading ? "Logging in..." : "Login"}
              </button>

              <p className="text-center text-gray-400 text-sm mt-6">
                Don&apos;t have an account?{" "}
                <span
                  onClick={() => { setIsLogin(false); setLoginError(""); }}
                  className="text-blue-400 cursor-pointer hover:underline"
                >
                  Sign up
                </span>
              </p>
            </motion.div>

          ) : (

            /* ── SIGN UP ── */
            <motion.div
              key="signup"
              initial={{ opacity: 0, x: -80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ duration: 0.35 }}
            >
              <h1 className="text-3xl font-semibold text-white text-center mb-8">
                Create an account
              </h1>

              {/* Success toast */}
              {signupSuccess && (
                <p className="text-emerald-400 text-sm mb-4 text-center bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-2 px-3">
                  ✓ Account created! Redirecting to login...
                </p>
              )}

              {/* Error */}
              {signupError && !signupSuccess && (
                <p className="text-red-500 text-sm mb-4 text-center bg-red-500/10 border border-red-500/20 rounded-lg py-2 px-3">
                  {signupError}
                </p>
              )}

              {/* Name */}
              <div className="mb-4">
                <label className="text-sm text-gray-400">Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Email */}
              <div className="mb-4">
                <label className="text-sm text-gray-400">Email</label>
                <input
                  type="email"
                  placeholder="Enter email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Password with eye */}
              <div className="mb-4">
                <label className="text-sm text-gray-400">Password</label>
                <PasswordInput
                  placeholder="Create password (min 6 chars)"
                  value={signupPassword}
                  onChange={setSignupPassword}
                />
              </div>

              {/* Confirm Password with eye */}
              <div className="mb-6">
                <label className="text-sm text-gray-400">Confirm Password</label>
                <PasswordInput
                  placeholder="Repeat password"
                  value={signupConfirm}
                  onChange={setSignupConfirm}
                />
              </div>

              {/* Premium blue create account button */}
              <button
                id="signup-btn"
                onClick={handleSignup}
                disabled={signupLoading || signupSuccess}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {signupLoading ? "Creating account..." : "Create account"}
              </button>

              <p className="text-center text-gray-400 text-sm mt-6">
                Already have an account?{" "}
                <span
                  onClick={() => { setIsLogin(true); setSignupError(""); }}
                  className="text-blue-400 cursor-pointer hover:underline"
                >
                  Login
                </span>
              </p>
            </motion.div>

          )}

        </AnimatePresence>
      </div>
    </div>
  );
}