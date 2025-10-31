"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-client";
import SpewnSection from "@/components/SpewnSection";
import type { Splits } from "../../app/types/splits";

/* Config presets */
const CONFIG = {
  PRESETS: {
    balanced: { savings: 20, parents_preserve: 15, extras_buffer: 10, wants: 25, needs: 30 } as Splits,
    conservative: { savings: 30, parents_preserve: 20, extras_buffer: 10, wants: 10, needs: 30 } as Splits,
    aggressive: { savings: 40, parents_preserve: 10, extras_buffer: 5, wants: 15, needs: 30 } as Splits
  },
  DEFAULT_PRESET: "balanced" as const
};

function sumSplits(s: Splits) {
  return Object.values(s).reduce((a, b) => a + Number(b || 0), 0);
}

/* Inline ConfirmNewCycleModal - collects startMonth + extraIncome */
function ConfirmNewCycleModal({ open, defaultStartMonth, onClose, onConfirm }: {
  open: boolean;
  defaultStartMonth?: string;
  onClose: () => void;
  onConfirm: (payload: { startMonth: string; extraIncome: number }) => Promise<void> | void;
}) {
  const [startMonth, setStartMonth] = useState<string>(defaultStartMonth ?? "");
  const [extraIncome, setExtraIncome] = useState<number | string>("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStartMonth(defaultStartMonth ?? "");
    setExtraIncome("");
    setErr("");
  }, [defaultStartMonth, open]);

  function validate() {
    if (!startMonth) { setErr("Choose a start month"); return false; }
    if (!/^\d{4}-\d{2}$/.test(startMonth)) { setErr("Start month must be YYYY-MM"); return false; }
    return true;
  }

  async function handleConfirm(e?: React.FormEvent) {
    e?.preventDefault();
    setErr("");
    if (!validate()) return;
    setSaving(true);
    try {
      await onConfirm({ startMonth, extraIncome: Number(extraIncome || 0) });
      onClose();
    } catch (err: any) {
      setErr(err?.message || "Failed to confirm");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold">Start a new salary cycle?</h3>
        <p className="text-sm text-slate-600 mt-2">This will record your previous salary in history and lock the chosen month (it cannot be changed later).</p>

        <form onSubmit={handleConfirm} className="mt-4 grid gap-3">
          <label className="text-sm">
            Start month
            <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className="w-full mt-1 p-2 border rounded" />
          </label>

          <label className="text-sm">
            Extra income for the month (optional)
            <input type="number" inputMode="numeric" value={extraIncome as any} onChange={(e) => setExtraIncome(e.target.value === "" ? "" : Number(e.target.value))} className="w-full mt-1 p-2 border rounded" placeholder="e.g., 5000" />
          </label>

          {err && <div className="text-sm text-red-500">{err}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-teal-500 text-white">{saving ? "Starting..." : "Start new cycle"}</button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-slate-100">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Onboarding page */
export default function OnboardingPage() {
  return <OnboardingInner />;
}

function OnboardingInner() {
  const { user, fetchMe } = useAuth();
  const router = useRouter();

  const [salary, setSalary] = useState<number | string>(user?.salary ?? "");
  const [preset, setPreset] = useState<"balanced" | "conservative" | "aggressive">((user?.preset as any) ?? CONFIG.DEFAULT_PRESET);
  const [splits, setSplits] = useState<Splits>(user?.splits ?? CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]);
  const [automate, setAutomate] = useState<boolean>(Boolean(user?.automate ?? false));
  const [activeTracking, setActiveTracking] = useState<boolean>(Boolean(user?.activeTracking ?? false));
  const [startMonth, setStartMonth] = useState<string>(user?.startMonth ?? "");
  const [extraIncome, setExtraIncome] = useState<number | string>("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [salaryChanged, setSalaryChanged] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setSalary(user.salary ?? "");
    setPreset((user.preset as any) ?? CONFIG.DEFAULT_PRESET);
    setSplits(user.splits ?? CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]);
    setAutomate(Boolean(user.automate ?? false));
    setActiveTracking(Boolean(user.activeTracking ?? false));
    setStartMonth(user.startMonth ?? "");
  }, [user]);

  useEffect(() => {
    const prev = Number(user?.salary ?? 0);
    const curr = Number(salary ?? 0);
    if (Number.isFinite(curr) && curr !== prev) setSalaryChanged(true);
    else setSalaryChanged(false);
  }, [salary, user?.salary]);

  const updateSplit = (key: keyof Splits, value: number) => setSplits((p) => ({ ...p, [key]: Number.isFinite(value) ? value : 0 }));
  const splitsAreValid = () => sumSplits(splits) === 100;

  const saveAndDistribute = useCallback(async (opts?: { startNewCycle?: boolean; startMonth?: string; extraIncome?: number }) => {
    setErr("");
    if (!splitsAreValid()) { setErr("Splits must sum to 100"); return; }
    const numericSalary = Number(salary);
    if (!numericSalary || numericSalary <= 0) { setErr("Please enter a valid monthly salary"); return; }

    const wantNewCycle = Boolean(opts?.startNewCycle);

    if (wantNewCycle && !opts?.startMonth) { setErr("Please choose a start month to start the new cycle"); return; }

    setLoading(true);
    try {
      const putBody: any = {
        salary: numericSalary,
        salaryFrequency: "monthly",
        splits,
        preset,
        automate,
      };
      if (wantNewCycle) {
        putBody.startNewCycle = true;
        putBody.startMonth = opts!.startMonth;
        putBody.extraIncome = opts!.extraIncome ?? 0;
      } else {
        if (startMonth) putBody.startMonth = startMonth;
      }

      const putRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(putBody)
      });
      if (!putRes.ok) {
        const j = await putRes.json().catch(() => ({ message: "Failed to save profile" }));
        throw new Error(j.message || "Failed to save profile");
      }

      const monthToUse = wantNewCycle ? opts!.startMonth! :  "";
      const simBody: any = {
        salary: numericSalary,
        splits,
        preset,
        month: monthToUse,
        extraIncome: opts?.extraIncome ?? Number(extraIncome || 0)
      };

      const simRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/simulate-distribute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(simBody)
      });
      if (!simRes.ok) {
        const j = await simRes.json().catch(() => ({ message: "Failed to simulate distribution" }));
        throw new Error(j.message || "Failed to simulate distribution");
      }

      if (typeof fetchMe === "function") await fetchMe();

      // Onboarding marked complete server-side; navigate to dashboard
      router.push("/dashboard");
    } catch (err: any) {
      console.error('save error', err);
      setErr(err?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [salary, splits, preset, automate, startMonth, extraIncome, activeTracking, fetchMe, router]);

  async function handleConfirmNewCycle(payload: { startMonth: string; extraIncome: number }) {
    await saveAndDistribute({ startNewCycle: true, startMonth: payload.startMonth, extraIncome: payload.extraIncome });
  }

  return (
    <main className="py-8 px-4 lg:px-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <section className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
          <h2 className="text-2xl font-semibold text-gray-800">Onboarding</h2>
          <p className="text-sm text-slate-500 mt-1">Enter monthly salary and set your split. Confirm starting a new cycle if salary changed.</p>

          <form onSubmit={(e) => { e.preventDefault(); saveAndDistribute(); }} className="mt-5 space-y-5">
            <label className="block">
              <div className="text-sm text-slate-600 mb-1">Monthly salary</div>
              <input type="number" inputMode="numeric" value={salary} onChange={(e) => setSalary(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g., 50000" className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>

            {salaryChanged && (
              <div className="p-3 rounded border-l-4 border-teal-200 bg-teal-50">
                <div className="text-sm font-medium">Detected change from previous salary</div>
                <div className="text-xs text-slate-600 mt-1">Start a new tracked cycle to record history and lock the month's salary, or update without starting a new tracked cycle.</div>
                <div className="mt-3 flex gap-3">
                  <button type="button" onClick={() => setConfirmModalOpen(true)} className="px-3 py-2 rounded bg-teal-500 text-white">Start new cycle</button>
                  <button type="button" onClick={() => setSalaryChanged(false)} className="px-3 py-2 rounded bg-slate-100">Update without starting new cycle</button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {(["balanced", "conservative", "aggressive"] as const).map((p) => (
                <button key={p} type="button" onClick={() => { setPreset(p); setSplits(CONFIG.PRESETS[p]); }} className={`px-4 py-2 rounded-lg font-medium transition ${preset === p ? "bg-teal-500 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{p[0].toUpperCase() + p.slice(1)}</button>
              ))}
            </div>

            <div>
              <h4 className="text-sm font-medium text-slate-700">Customize splits</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {(Object.keys(splits) as (keyof Splits)[]).map((k) => (
                  <div key={k} className="flex items-center gap-3">
                    <div className="w-40 capitalize text-slate-700">{k.replace("_", " / ")}</div>
                    <input type="number" value={splits[k]} onChange={(e) => updateSplit(k, Number(e.target.value || 0))} className="p-2 border border-slate-200 rounded w-28 focus:ring-1 focus:ring-teal-500" />
                    <div className="text-sm text-slate-600">%</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm text-slate-500">Sum: <span className={sumSplits(splits) === 100 ? "font-medium text-slate-700" : "text-red-500 font-semibold"}>{sumSplits(splits)}%</span></div>
            </div>

            <div className="mt-3">
              <div className="text-sm text-slate-600 mb-1">Automate monthly distribution?</div>
              <div className="flex items-center gap-4">
                <label className={`inline-flex items-center px-3 py-2 rounded-lg cursor-pointer ${automate ? "bg-teal-50 border border-teal-200" : "bg-slate-100"}`}>
                  <input type="radio" name="automate" checked={automate === true} onChange={() => setAutomate(true)} className="mr-2" /> Yes — automate
                </label>
                <label className={`inline-flex items-center px-3 py-2 rounded-lg cursor-pointer ${!automate ? "bg-teal-50 border border-teal-200" : "bg-slate-100"}`}>
                  <input type="radio" name="automate" checked={automate === false} onChange={() => setAutomate(false)} className="mr-2" /> No — manual preview
                </label>
              </div>
              <div className="mt-2 text-xs text-slate-500">If automate is enabled, SPEWN will create the month’s distribution automatically when you first load your profile in the new month.</div>
            </div>

            {err && <div className="text-sm text-red-500">{err}</div>}

            <div className="flex gap-3 items-center">
              <button type="submit" disabled={loading} className="bg-teal-500 text-white px-5 py-2 rounded-lg hover:bg-teal-600 transition disabled:opacity-60">{loading ? "Saving..." : "Save & Continue"}</button>
              <button type="button" onClick={() => { setSalary(""); setPreset(CONFIG.DEFAULT_PRESET); setSplits(CONFIG.PRESETS[CONFIG.DEFAULT_PRESET]); setAutomate(false); setActiveTracking(false); setStartMonth(""); setExtraIncome(""); setErr(""); }} className="px-4 py-2 rounded bg-slate-100">Reset</button>
            </div>
          </form>
        </section>

        <SpewnSection />
      </div>

      <ConfirmNewCycleModal open={confirmModalOpen} defaultStartMonth={startMonth} onClose={() => setConfirmModalOpen(false)} onConfirm={handleConfirmNewCycle} />
    </main>
  );
}
