"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-client";
import SpewnSection from "@/components/SpewnSection";
import type { Splits } from "../../app/types/splits";

/**
 * CONFIG: All hardcoded data lives here.
 * - PRESETS: three preset split objects
 * - DEFAULT_PRESET: which preset to use initially
 * - FOOTER_TEXT: (example of other centralized strings if desired)
 */
const CONFIG = {
  PRESETS: {
    balanced: { savings: 20, parents_preserve: 15, extras_buffer: 10, wants: 25, needs: 30 } as Splits,
    conservative: { savings: 30, parents_preserve: 20, extras_buffer: 10, wants: 10, needs: 30 } as Splits,
    aggressive: { savings: 40, parents_preserve: 10, extras_buffer: 5, wants: 15, needs: 30 } as Splits,
  },
  DEFAULT_PRESET: "balanced" as const,
};

/**
 * Minimal helper to compute sum of splits (keeps UI tidy)
 */
function sumSplits(s: Splits) {
  return Object.values(s).reduce((a, b) => a + Number(b || 0), 0);
}

/**
 * OnboardingPage - wrapper to keep Next.js default export stable
 */
export default function OnboardingPage() {
  return <OnboardingInner />;
}

/**
 * OnboardingInner - main component
 *
 * Features:
 * - Loads defaults from `useAuth()` when available
 * - Stores salary, preset, splits in local state
 * - Saves profile + calls simulate-distribute on submit (simple fetch usage)
 * - Responsive two-column layout: form on left, SPEWN explanation on right
 */
function OnboardingInner() {
  const { user, fetchMe } = useAuth();
  const router = useRouter();

  // initialize state either from user profile or fall back to config
  const [salary, setSalary] = useState<number | string>(user?.salary ?? "");
  const [preset, setPreset] = useState<"balanced" | "conservative" | "aggressive">(
    (user?.preset as any) ?? CONFIG.DEFAULT_PRESET
  );
  const [splits, setSplits] = useState<Splits>(user?.splits ?? CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // if user loads after mount, sync profile -> form
  useEffect(() => {
    if (!user) return;
    setSalary(user.salary ?? "");
    setPreset((user.preset as any) ?? CONFIG.DEFAULT_PRESET);
    setSplits(user.splits ?? CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]);
  }, [user]);

  // small utility to update one split
  const updateSplit = (key: keyof Splits, value: number) =>
    setSplits((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));

  // validate splits sum to 100
  const splitsAreValid = () => sumSplits(splits) === 100;

  /**
   * saveAndDistribute
   * - Validates splits
   * - Sends a PUT to /api/profile to save (credentials included)
   * - Calls /api/simulate-distribute to compute amounts server-side (optional)
   * - refreshes user via fetchMe() and navigates to /dashboard
   *
   * Keep the fetch URLs aligned with your backend env var.
   */
  const saveAndDistribute = useCallback(
    async (e?: React.FormEvent) => {
      if (e?.preventDefault) e.preventDefault();
      setErr("");

      if (!splitsAreValid()) {
        setErr("Splits must sum to 100");
        return;
      }

      // Basic client-side sanity
      const numericSalary = Number(salary);
      if (!numericSalary || numericSalary <= 0) {
        setErr("Please enter a valid monthly salary");
        return;
      }

      setLoading(true);
      try {
        // Save profile
        const putRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profile`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            salary: numericSalary,
            salaryFrequency: "monthly",
            splits,
            preset,
          }),
        });
        if (!putRes.ok) throw new Error((await putRes.json()).message || "Failed to save profile");

        // Optional: simulate distribution (server returns rounded amounts / persisted distribution)
        const simRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/simulate-distribute`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ salary: numericSalary, splits, preset }),
        });
        if (!simRes.ok) throw new Error((await simRes.json()).message || "Failed to simulate distribution");

        // Refresh local user data if your hook supports it
        if (typeof fetchMe === "function") await fetchMe();

        // Navigate to dashboard after success
        router.push("/dashboard");
      } catch (error: any) {
        setErr(error?.message ?? "An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    },
    [salary, splits, preset, fetchMe, router]
  );

  return (
    <main className="py-8 px-4 lg:px-12">
      {/* Two-column responsive layout: form (left) + SpewnSection (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* LEFT COLUMN: Onboarding Form */}
        <section className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
          <h2 className="text-2xl font-semibold text-gray-800">Onboarding</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter monthly salary and pick a preset — or customize your own split (must sum to 100).
          </p>

          <form onSubmit={saveAndDistribute} className="mt-5 space-y-5">
            {/* Salary */}
            <label className="block">
              <div className="text-sm text-slate-600 mb-1">Monthly salary</div>
              <input
                type="number"
                inputMode="numeric"
                value={salary}
                onChange={(e) => setSalary(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g., 50000"
                className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>

            {/* Preset buttons */}
            <div className="flex flex-wrap gap-3">
              {(["balanced", "conservative", "aggressive"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPreset(p);
                    setSplits(CONFIG.PRESETS[p]);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    preset === p ? "bg-teal-500 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {/* Custom splits */}
            <div>
              <h4 className="text-sm font-medium text-slate-700">Customize splits</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {(Object.keys(splits) as (keyof Splits)[]).map((k) => (
                  <div key={k} className="flex items-center gap-3">
                    <div className="w-40 capitalize text-slate-700">{k.replace("_", " / ")}</div>
                    <input
                      type="number"
                      value={splits[k]}
                      onChange={(e) => updateSplit(k, Number(e.target.value || 0))}
                      className="p-2 border border-slate-200 rounded w-28 focus:ring-1 focus:ring-teal-500"
                    />
                    <div className="text-sm text-slate-600">%</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 text-sm text-slate-500">
                Sum: <span className={sumSplits(splits) === 100 ? "font-medium text-slate-700" : "text-red-500 font-semibold"}>
                  {sumSplits(splits)}%
                </span>
              </div>
            </div>

            {/* Error & actions */}
            {err && <div className="text-sm text-red-500">{err}</div>}

            <div className="flex flex-wrap gap-3 items-center">
              <button
                type="submit"
                disabled={loading}
                className="bg-teal-500 text-white px-5 py-2 rounded-lg hover:bg-teal-600 transition disabled:opacity-60"
              >
                {loading ? "Saving..." : "Save & Go to Dashboard"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSalary("");
                  setPreset(CONFIG.DEFAULT_PRESET);
                  setSplits(CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]);
                  setErr("");
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        {/* RIGHT COLUMN: SPEWN Explanation */}
          <SpewnSection />
      </div>
    </main>
  );
}
