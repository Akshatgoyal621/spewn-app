"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {useAuth} from "../lib/auth-client";

export default function Page() {
  const {user, fetchMe} = useAuth();
  const router = useRouter();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [fpEmail, setFpEmail] = useState("");
  const [fpMessage, setFpMessage] = useState("");
  const [fpToken, setFpToken] = useState("");
  const [fpNewPassword, setFpNewPassword] = useState("");
  const [fpStage, setFpStage] = useState<"request" | "reset">("request");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const path = isRegister ? "/api/auth/register" : "/api/auth/login";
      const body: any = {email, password};
      if (isRegister) body.name = name;
      if (!isRegister) body.rememberMe = rememberMe;

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`, {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Error");

      // refresh auth context (cookies set by server)
      await fetchMe();

      // fetch fresh /me to make a deterministic redirect decision
      const meRes = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/me`,
        {
          credentials: "include",
        }
      );

      if (!meRes.ok) {
        // fallback: go to onboarding (safe default)
        router.push("/onboarding");
        return;
      }

      const me = await meRes.json();

      // decide: consider profile "complete" when salary exists and splits sum to 100
      const salaryOk = Number(me.salary) > 0;
      const splits = me.splits || {};
      const splitsSum = Object.values(splits).reduce(
        (a: any, b: any) => a + Number(b || 0),
        0
      );
      const profileComplete = salaryOk && splitsSum === 100;

      if (profileComplete) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (e: any) {
      setErr(e.message || "Error");
    }
  }

  // Forgot password request
  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setFpMessage("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({email: fpEmail}),
        }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "Error");
      setFpMessage(
        "If account exists, reset instructions generated. (Check server console in dev.)"
      );
      setFpStage("reset");
    } catch (err: any) {
      setFpMessage(err.message || "Error");
    }
  }

  // Use the token printed on the server (dev) to reset
  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    setFpMessage("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/reset-password`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({token: fpToken, newPassword: fpNewPassword}),
        }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "Error");
      setFpMessage(
        "Password reset successful — you can now login with new password."
      );
      setShowForgot(false);
      setFpStage("request");
      setFpEmail("");
      setFpToken("");
      setFpNewPassword("");
    } catch (err: any) {
      setFpMessage(err.message || "Error");
    }
  }

  function openGoogle() {
    // opens backend google auth endpoint which will redirect to Google
    window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/google`;
  }

  return (
    <main className="py-12">
      <section className="bg-white rounded-2xl shadow p-8 max-w-md mx-auto">
        <div className="flex gap-2 mt-6">
          <button
            onClick={() => setIsRegister(false)}
            className={`px-4 py-2 rounded ${
              !isRegister ? "bg-teal-500 text-white" : "bg-slate-100"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setIsRegister(true)}
            className={`px-4 py-2 rounded ${
              isRegister ? "bg-teal-500 text-white" : "bg-slate-100"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-3">
          {isRegister && (
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="p-3 rounded border"
            />
          )}
          <input
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="p-3 rounded border"
          />
          <div className="relative">
            <input
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              className="p-3 rounded border w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="right-2 top-2 text-sm text-slate-500"
          >
            {showPassword ? "Hide Password" : "Show Password"}
          </button>

          {!isRegister && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Remember me
            </label>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              className="bg-teal-500 text-white py-2 px-4 rounded"
            >
              {isRegister ? "Register" : "Login"}
            </button>
            <button
              type="button"
              onClick={() => openGoogle()}
              className="px-4 py-2 rounded border flex-1"
            >
              Sign in with Google
            </button>
          </div>

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="text-sm text-slate-500"
            >
              Forgot password?
            </button>
            {err && <div className="text-sm text-red-500">{err}</div>}
          </div>
        </form>
      </section>

      {/* Forgot Password Modal (simple) */}
      {showForgot && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white p-6 rounded shadow max-w-md w-full">
            <h3 className="text-lg font-semibold">Forgot password</h3>
            {fpStage === "request" ? (
              <form onSubmit={requestReset} className="mt-4 grid gap-2">
                <input
                  required
                  value={fpEmail}
                  onChange={(e) => setFpEmail(e.target.value)}
                  placeholder="Your email"
                  className="p-2 border rounded"
                />
                <div className="flex gap-2">
                  <button className="px-3 py-2 bg-teal-500 text-white rounded">
                    Send reset token
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForgot(false)}
                    className="px-3 py-2 bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                </div>
                {fpMessage && (
                  <div className="text-sm mt-2 text-slate-600">{fpMessage}</div>
                )}
              </form>
            ) : (
              <form onSubmit={doReset} className="mt-4 grid gap-2">
                <input
                  required
                  value={fpToken}
                  onChange={(e) => setFpToken(e.target.value)}
                  placeholder="Token (from server console in dev)"
                  className="p-2 border rounded"
                />
                <input
                  required
                  value={fpNewPassword}
                  onChange={(e) => setFpNewPassword(e.target.value)}
                  placeholder="New password"
                  className="p-2 border rounded"
                />
                <div className="flex gap-2">
                  <button className="px-3 py-2 bg-teal-500 text-white rounded">
                    Reset password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFpStage("request");
                      setFpMessage("");
                    }}
                    className="px-3 py-2 bg-slate-100 rounded"
                  >
                    Back
                  </button>
                </div>
                {fpMessage && (
                  <div className="text-sm mt-2 text-slate-600">{fpMessage}</div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
