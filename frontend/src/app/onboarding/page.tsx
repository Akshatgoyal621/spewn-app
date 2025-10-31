"use client";

import React, {useCallback, useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {useAuth} from "../../lib/auth-client";
import SpewnSection from "@/components/SpewnSection";
import type {Splits} from "../../app/types/splits";

/* Config presets */
const CONFIG = {
  PRESETS: {
    balanced: {
      savings: 20,
      parents_preserve: 15,
      extras_buffer: 10,
      wants: 25,
      needs: 30,
    } as Splits,
    conservative: {
      savings: 30,
      parents_preserve: 20,
      extras_buffer: 10,
      wants: 10,
      needs: 30,
    } as Splits,
    aggressive: {
      savings: 40,
      parents_preserve: 10,
      extras_buffer: 5,
      wants: 15,
      needs: 30,
    } as Splits,
  },
  DEFAULT_PRESET: "balanced" as const,
};

function sumSplits(s: Splits) {
  return Object.values(s).reduce((a, b) => a + Number(b || 0), 0);
}

/* Onboarding page */
export default function OnboardingPage() {
  return <OnboardingInner />;
}

function OnboardingInner() {
  const {user, fetchMe} = useAuth();
  const router = useRouter();

  // default to server value if present, otherwise blank/default preset
  const [salary, setSalary] = useState<number | string>(user?.salary ?? "");
  const [preset, setPreset] = useState<
    "balanced" | "conservative" | "aggressive"
  >((user?.preset as any) ?? CONFIG.DEFAULT_PRESET);
  const [splits, setSplits] = useState<Splits>(
    user?.splits ?? CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]
  );

  // AUTOMATION & NEW CYCLE: disabled for now
  // keep state so server calls still have the field if required, but UI won't allow enabling it
  const [automate] = useState<boolean>(false);
  const [activeTracking] = useState<boolean>(false);

  // optional fields kept for future use
  const [startMonth, setStartMonth] = useState<string>(user?.startMonth ?? "");
  const [extraIncome, setExtraIncome] = useState<number | string>("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // local flags removed: salaryChanged / confirmModalOpen removed (start-new-cycle disabled)
  // allow user to freely change salary and splits but they will not lock a new cycle yet

  useEffect(() => {
    if (!user) return;
    setSalary(user.salary ?? "");
    setPreset((user.preset as any) ?? CONFIG.DEFAULT_PRESET);
    setSplits(user.splits ?? CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]);
    // automate & activeTracking intentionally left unchanged (disabled)
    setStartMonth(user.startMonth ?? "");
  }, [user]);

  const updateSplit = (key: keyof Splits, value: number) =>
    setSplits((p) => ({...p, [key]: Number.isFinite(value) ? value : 0}));
  const splitsAreValid = () => sumSplits(splits) === 100;

  const saveAndDistribute = useCallback(async () => {
    setErr("");
    if (!splitsAreValid()) {
      setErr("Splits must sum to 100");
      return;
    }
    const numericSalary = Number(salary);
    if (!numericSalary || numericSalary <= 0) {
      setErr("Please enter a valid monthly salary");
      return;
    }

    setLoading(true);
    try {
      const putBody: any = {
        salary: numericSalary,
        salaryFrequency: "monthly",
        splits,
        preset,
        // automation is disabled in the UI for now — keep the field false to avoid accidental enables
        automate: false,
        // keep activeTracking false for now
        activeTracking: false,
      };

      // If you later want to let users set a startMonth manually (without starting a "new cycle"),
      // the client can pass startMonth. We don't attempt any "startNewCycle" workflows here.
      if (startMonth) putBody.startMonth = startMonth;

      const putRes = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profile`,
        {
          method: "PUT",
          credentials: "include",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(putBody),
        }
      );
      if (!putRes.ok) {
        const j = await putRes
          .json()
          .catch(() => ({message: "Failed to save profile"}));
        throw new Error(j.message || "Failed to save profile");
      }

      // optional: simulate distribution server-side for the profile (keeps client display consistent)
      const simBody: any = {
        salary: numericSalary,
        splits,
        preset,
        month: "", // no new cycle requested from UI
        extraIncome: Number(extraIncome || 0),
      };

      const simRes = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/simulate-distribute`,
        {
          method: "POST",
          credentials: "include",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(simBody),
        }
      );
      if (!simRes.ok) {
        // don't block save just because simulation failed, but surface a warning
        console.warn("simulate-distribute responded with error");
      }

      if (typeof fetchMe === "function") await fetchMe();

      // Onboarding completed -> go to dashboard
      router.push("/dashboard");
    } catch (err: any) {
      console.error("save error", err);
      setErr(err?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [salary, splits, preset, startMonth, extraIncome, fetchMe, router]);

  // simple reset helper
  function handleReset() {
    setSalary("");
    setPreset(CONFIG.DEFAULT_PRESET);
    setSplits(CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]);
    setStartMonth("");
    setExtraIncome("");
    setErr("");
  }

  return (
    <main className="py-8 px-4 lg:px-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <section className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
          <h2 className="text-2xl font-semibold text-gray-800">Onboarding</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter monthly salary and set your split. Automation and "start new
            cycle" are temporarily disabled so you can try the app manually
            first.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveAndDistribute();
            }}
            className="mt-5 space-y-5"
          >
            <label className="block">
              <div className="text-sm text-slate-600 mb-1">Monthly salary</div>
              <input
                type="number"
                inputMode="numeric"
                value={salary}
                onChange={(e) =>
                  setSalary(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="e.g., 50000"
                className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>

            {/* NOTE: start-new-cycle UI removed; admins/ops can still create a new cycle server-side if needed later */}

            <div className="flex flex-wrap gap-3">
              {(["balanced", "conservative", "aggressive"] as const).map(
                (p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPreset(p);
                      setSplits(CONFIG.PRESETS[p]);
                    }}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      preset === p
                        ? "bg-teal-500 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {p[0].toUpperCase() + p.slice(1)}
                  </button>
                )
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-slate-700">
                Customize splits
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {(Object.keys(splits) as (keyof Splits)[]).map((k) => (
                  <div key={k} className="flex items-center gap-3">
                    <div className="w-40 capitalize text-slate-700">
                      {k.replace("_", " / ")}
                    </div>
                    <input
                      type="number"
                      value={splits[k]}
                      onChange={(e) =>
                        updateSplit(k, Number(e.target.value || 0))
                      }
                      className="p-2 border border-slate-200 rounded w-28 focus:ring-1 focus:ring-teal-500"
                    />
                    <div className="text-sm text-slate-600">%</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Sum:{" "}
                <span
                  className={
                    sumSplits(splits) === 100
                      ? "font-medium text-slate-700"
                      : "text-red-500 font-semibold"
                  }
                >
                  {sumSplits(splits)}%
                </span>
              </div>
            </div>

            {/* Automate controls disabled for now */}
            <div className="mt-3">
              <div className="text-sm text-slate-600 mb-1">
                Automate monthly distribution
              </div>
              <div className="p-3 rounded border border-yellow-100 bg-yellow-50 text-sm text-slate-700">
                Automation and automatic cycle start are currently disabled
                while we stabilize the manual workflow. You can still enter your
                salary and try the app manually. Automation will be re-enabled
                later.
              </div>
            </div>

            {err && <div className="text-sm text-red-500">{err}</div>}

            <div className="flex gap-3 items-center">
              <button
                type="submit"
                disabled={loading}
                className="bg-teal-500 text-white px-5 py-2 rounded-lg hover:bg-teal-600 transition disabled:opacity-60"
              >
                {loading ? "Saving..." : "Save & Continue"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded bg-slate-100"
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        <SpewnSection />
      </div>
    </main>
  );
}
