"use client";

import React, {useEffect, useMemo, useState} from "react";
import {useRouter} from "next/navigation";
import {useAuth} from "../../lib/auth-client";
import {Modal} from "@/modals/Modal";
import {DonutChart} from "@/charts/DonutChart";
import {exportPrintable} from "@/docgen/ExportPrintable";

/* ---------------------- Types ---------------------- */

type SplitMap = Record<string, number>;

type Transaction = {
  transactionId: string;
  date: string;
  amount: number;
  bucket?: string;
  category?: string;
  notes?: string;
};

type UserProfile = {
  id: string;
  email?: string;
  name?: string;
  salary?: number;
  splits?: SplitMap;
  distribution?: Record<string, number>;
  distributionByMonth?: Record<string, Record<string, number>>;
  preset?: string;
  currency?: string;
  transactions?: Transaction[];
  subscribed?: boolean;
  automate?: boolean;
  activeTracking?: boolean;
  salaryHistory?: Array<{
    salary: number;
    startMonth?: string;
    extraIncome?: number;
  }>;
  salaryLockedMonth?: string;
  startMonth?: string;
};

/* ---------------------- Helpers ---------------------- */
function formatCurrency(amount?: number | null, currency = "INR") {
  const n = Number(amount ?? 0);
  if (!isFinite(n) || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function monthKeyFromDate(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

/* ---------------------- Transaction Modal ---------------------- */
function TransactionModal({
  open,
  onClose,
  onSave,
  defaultBucket,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    amount: number;
    bucket?: string;
    category?: string;
    notes?: string;
    date?: string;
  }) => Promise<void> | void;
  defaultBucket?: string;
}) {
  const [amount, setAmount] = useState<string>("");
  const [bucket, setBucket] = useState<string | undefined>(defaultBucket);
  const [category, setCategory] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount("");
      setBucket(defaultBucket);
      setCategory("");
      setNotes("");
      setErr(null);
      setSaving(false);
    }
  }, [open, defaultBucket]);

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    const amt = Number(amount);
    if (!amt || Number.isNaN(amt)) {
      setErr("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        amount: amt,
        bucket,
        category,
        notes,
        date: new Date().toISOString().slice(0, 10),
      });
      onClose();
    } catch (error: any) {
      setErr(error?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
        <h3 className="text-lg font-semibold">Add transaction</h3>
        <form onSubmit={handleSave} className="mt-4 grid gap-3">
          <label className="text-sm">
            Amount (₹)
            <input
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 p-2 border rounded"
              placeholder="e.g., 1200"
            />
          </label>

          <label className="text-sm">
            Bucket
            <input
              value={bucket ?? ""}
              onChange={(e) => setBucket(e.target.value)}
              className="w-full mt-1 p-2 border rounded"
              placeholder="wants / needs / savings"
            />
          </label>

          <label className="text-sm">
            Category
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full mt-1 p-2 border rounded"
              placeholder="Groceries / Netflix"
            />
          </label>

          <label className="text-sm">
            Notes
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full mt-1 p-2 border rounded"
              placeholder="Optional note"
            />
          </label>

          {err && <div className="text-sm text-red-500">{err}</div>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-teal-500 text-white"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------- Main Dashboard ---------------------- */
export default function DashboardPage() {
  return <DashboardInner />;
}

function DashboardInner() {
  const {user, fetchMe} = useAuth() as {
    user?: UserProfile | null;
    fetchMe?: () => Promise<void>;
  };
  const router = useRouter();

  const [txns, setTxns] = useState<Transaction[]>([]);
  const [txnLoading, setTxnLoading] = useState<boolean>(false);
  const [txnModalOpen, setTxnModalOpen] = useState<boolean>(false);
  const [txnDefaultBucket, setTxnDefaultBucket] = useState<string | undefined>(
    undefined
  );
  const [historyModalOpen, setHistoryModalOpen] = useState<boolean>(false);
  const [historyCategory, setHistoryCategory] = useState<string | null>(null);

  // IS Mobile Calculation
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }

    handleResize(); // run once on mount
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const currentMonth = monthKeyFromDate();
  const prevMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  const distributionByMonth = useMemo(() => {
    if (!user?.distributionByMonth)
      return {} as Record<string, Record<string, number>>;
    return user.distributionByMonth;
  }, [user?.distributionByMonth]);

  const distribution = useMemo(() => {
    if (!user) return null;

    // If activeTracking is true, prefer persisted per-month distribution for currentMonth
    if (user.activeTracking) {
      const persisted = distributionByMonth?.[currentMonth];
      if (persisted && Object.keys(persisted).length) return persisted;

      // fallback to top-level distribution if present
      if (user.distribution && Object.keys(user.distribution).length)
        return user.distribution;
    } else {
      // if not actively tracking, prefer top-level distribution if available
      if (user.distribution && Object.keys(user.distribution).length)
        return user.distribution;
    }

    // Last fallback: compute from salary + splits
    try {
      const salaryNum = Number(user.salary ?? 0);
      const splits = user.splits ?? {};
      const keys = Object.keys(splits);
      if (salaryNum <= 0 || keys.length === 0) return null;
      const comp: Record<string, number> = {};
      keys.forEach(
        (k) =>
          (comp[k] = Math.round((salaryNum * Number(splits[k] ?? 0)) / 100))
      );
      return comp;
    } catch {
      return null;
    }
  }, [user, distributionByMonth, currentMonth]);

  const prevDistribution = useMemo(() => {
    if (!user) return null;

    // If activeTracking is true, prefer persisted per-month distribution for prevMonth
    if (user.activeTracking) {
      const persisted = distributionByMonth?.[prevMonth];
      if (persisted && Object.keys(persisted).length) return persisted;
    }

    // If salaryHistory exists, use the most recent entry to compute previous distribution
    const hist = user.salaryHistory ?? [];
    if (hist.length > 0) {
      const last = hist[hist.length - 1];
      const splits = user.splits ?? {};
      const comp: Record<string, number> = {};
      Object.keys(splits).forEach(
        (k) =>
          (comp[k] = Math.round(
            ((Number(last.salary) + Number(last.extraIncome ?? 0)) *
              Number(splits[k] ?? 0)) /
              100
          ))
      );
      return comp;
    }

    // As a last fallback, try to compute using top-level salary (though that represents current)
    try {
      const salaryNum = Number(user.salary ?? 0);
      const splits = user.splits ?? {};
      const keys = Object.keys(splits);
      if (salaryNum <= 0 || keys.length === 0) return null;
      const comp: Record<string, number> = {};
      keys.forEach(
        (k) =>
          (comp[k] = Math.round((salaryNum * Number(splits[k] ?? 0)) / 100))
      );
      return comp;
    } catch {
      return null;
    }
  }, [user, distributionByMonth, prevMonth]);

  const chartData = useMemo(() => {
    if (!user?.splits) return [] as {key: string; value: number}[];
    return Object.keys(user.splits).map((k) => ({
      key: k,
      value: Number(user.splits![k] ?? 0),
    }));
  }, [user?.splits]);

  useEffect(() => {
    async function loadTxns() {
      setTxnLoading(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/transactions?month=${currentMonth}`,
          {credentials: "include"}
        );
        if (!res.ok) {
          setTxns(user?.transactions ?? []);
        } else {
          const body = await res.json();
          setTxns(
            (body?.transactions as Transaction[]) ?? user?.transactions ?? []
          );
        }
      } catch {
        setTxns(user?.transactions ?? []);
      } finally {
        setTxnLoading(false);
      }
    }
    if (user) loadTxns();
  }, [user, currentMonth]);

  const {
    spentByBucket,
    remainingByBucket,
    totalAllocated,
    totalSpent,
    totalRemaining,
  } = useMemo(() => {
    const spent: Record<string, number> = {};
    (txns ?? []).forEach((t) => {
      const b = (t.bucket ?? "unspecified").toString();
      spent[b] = (spent[b] || 0) + Number(t.amount || 0);
    });
    const alloc = distribution ?? {};
    const remaining: Record<string, number> = {};
    Object.keys(alloc).forEach(
      (k) =>
        (remaining[k] = Math.max(0, Number(alloc[k] || 0) - (spent[k] || 0)))
    );
    const totalAlloc = Object.values(alloc).reduce(
      (a, b) => a + Number(b || 0),
      0
    );
    const totalSpentVal = Object.values(spent).reduce(
      (a, b) => a + Number(b || 0),
      0
    );
    return {
      spentByBucket: spent,
      remainingByBucket: remaining,
      totalAllocated: totalAlloc,
      totalSpent: totalSpentVal,
      totalRemaining: totalAlloc - totalSpentVal,
    };
  }, [txns, distribution]);

  const prevSavings = Number(prevDistribution?.savings ?? 0);
  const currSavings = Number(distribution?.savings ?? 0);
  const totalSavingsNow = prevSavings + currSavings;

  function openHistoryModal(category: string) {
    setHistoryCategory(category);
    setHistoryModalOpen(true);
  }

  function getHistoryFor(category: string) {
    const all = txns ?? user?.transactions ?? [];
    if (category === "unspecified") return all.filter((t) => !t.bucket);
    return all.filter(
      (t) => (t.bucket ?? "").toLowerCase() === category.toLowerCase()
    );
  }

  function openTxnModal(bucket?: string) {
    setTxnDefaultBucket(bucket);
    setTxnModalOpen(true);
  }

  async function handleSaveTxn(payload: {
    amount: number;
    bucket?: string;
    category?: string;
    notes?: string;
    date?: string;
  }) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/transactions`,
      {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({message: "Failed"}));
      throw new Error(j.message || "Failed to save transaction");
    }
    const body = await res.json();
    const newTxn = body.txn as Transaction;
    setTxns((p) => [newTxn, ...(p ?? [])]);
    if (typeof fetchMe === "function") await fetchMe();
  }

  function handleExport() {
    const rows = Object.keys(user?.splits ?? {})
      .map((k) => {
        const pct = Number(user!.splits![k]) ?? 0;
        const amt = distribution ? distribution[k] ?? 0 : 0;
        const spent = spentByBucket[k] ?? 0;
        const remaining = remainingByBucket[k] ?? amt;
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;">
          <div style="flex:1">${k.replace("_", " / ")} — ${pct}%</div>
          <div style="width:120px;text-align:right">${formatCurrency(amt)}</div>
          <div style="width:120px;text-align:right">${formatCurrency(
            spent
          )}</div>
          <div style="width:120px;text-align:right">${formatCurrency(
            remaining
          )}</div>
        </div>`;
      })
      .join("\n");

    const html = `
      <h1>SPEWN — Salary distribution</h1>
      <p>${user?.name ?? ""} • Preset: ${
      user?.preset ?? "—"
    } • Salary: ${formatCurrency(Number(user?.salary ?? 0))}</p>
      <div style="margin-top:12px">${rows}</div>
      <div style="margin-top:12px">Previous savings: ${formatCurrency(
        prevSavings
      )} • Current savings: ${formatCurrency(
      currSavings
    )} • Total: ${formatCurrency(totalSavingsNow)}</div>
      <div style="margin-top:18px; font-size:12px; color:#666">Generated by SPEWN</div>
    `;
    exportPrintable({title: "SPEWN distribution", html});
  }

  function onEdit() {
    router.push("/onboarding");
  }

  if (!user) {
    return (
      <main className="py-8 px-4">
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm text-center">
          <div className="text-lg font-semibold text-slate-700">
            Loading profile…
          </div>
          <div className="text-sm text-slate-500 mt-2">
            Fetching your info — one moment.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="py-8 px-4 lg:px-12">
      {/* Header */}
      <div className="w-full">
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 leading-tight">
                Welcome,{" "}
                <span className="text-teal-600">{user.name ?? "—"}</span>
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Here’s how your salary is distributed this month.
              </p>
            </div>

            {isMobile ? (
              <div></div>
            ) : (
              <div className="flex items-center gap-2 ">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium truncate ${
                    user.automate
                      ? "bg-green-50 text-green-800"
                      : "bg-yellow-50 text-yellow-800"
                  }`}
                  title={
                    user.automate
                      ? `Automate: ON (start ${user.startMonth ?? "—"})`
                      : "Automate: OFF"
                  }
                >
                  {user.automate
                    ? `Automate: ON (start ${user.startMonth ?? "—"})`
                    : "Automate: OFF"}
                </span>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium truncate ${
                    user.subscribed
                      ? "bg-teal-50 text-teal-800"
                      : "bg-red-50 text-red-700"
                  }`}
                  title={user.subscribed ? "Subscribed" : "Free • Subscribe"}
                >
                  {user.subscribed ? "Subscribed" : "Free • Subscribe"}
                </span>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium truncate ${
                    user.activeTracking
                      ? "bg-indigo-50 text-indigo-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                  title={
                    user.activeTracking ? "Active tracking" : "Manual / Preview"
                  }
                >
                  {user.activeTracking ? "Active tracking" : "Manual / Preview"}
                </span>
              </div>
            )}

            <div className="flex items-start justify-end gap-3">
              <div className="hidden sm:flex flex-col text-sm text-slate-600 mr-2 min-w-[12rem]">
                <div className="truncate">
                  Preset:{" "}
                  <span className="font-medium text-slate-800">
                    {(user.preset ?? "—").toString().toUpperCase()}
                  </span>
                </div>
                <div className="mt-1 truncate">
                  Salary:{" "}
                  <span className="font-medium text-slate-800">
                    {formatCurrency(user.salary)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2">
                  <button
                    onClick={onEdit}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200 transition"
                  >
                    Edit inputs
                  </button>
                  <button
                    onClick={handleExport}
                    className="rounded-full bg-teal-500 text-white px-4 py-2 text-sm font-medium hover:bg-teal-600 transition"
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 sm:hidden border-t pt-3">
            <div className="flex flex-col gap-3">
              <div className="text-sm text-slate-600">
                <div>
                  Preset:{" "}
                  <span className="font-medium text-slate-800">
                    {(user.preset ?? "—").toString().toUpperCase()}
                  </span>
                </div>
                <div className="mt-1">
                  Salary:{" "}
                  <span className="font-medium text-slate-800">
                    {formatCurrency(user.salary)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.automate
                      ? "bg-green-50 text-green-800"
                      : "bg-yellow-50 text-yellow-800"
                  }`}
                >
                  {user.automate
                    ? `Automate: ON (start ${user.startMonth ?? "—"})`
                    : "Automate: OFF"}
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.subscribed
                      ? "bg-teal-50 text-teal-800"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {user.subscribed ? "Subscribed" : "Free • Subscribe"}
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.activeTracking
                      ? "bg-indigo-50 text-indigo-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {user.activeTracking ? "Active tracking" : "Manual / Preview"}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onEdit}
                  className="flex-1 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200 transition"
                >
                  Edit inputs
                </button>
                <button
                  onClick={handleExport}
                  className="flex-1 rounded-full bg-teal-500 text-white px-4 py-2 text-sm font-medium hover:bg-teal-600 transition"
                >
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <section className="mt-6 grid grid-cols-1 lg:grid-cols-3">
        <div
          className={
            isMobile
              ? "col-span-1 bg-white border border-gray-100 mb-6 rounded-2xl p-5 shadow-sm"
              : "col-span-1 bg-white border border-gray-100 mr-6 rounded-2xl p-5 shadow-sm"
          }
        >
          <div className="flex items-center gap-4">
            <DonutChart data={chartData} size={120} />
            <div className="ml-2">
              <div className="text-sm text-slate-600">
                Distribution (percent)
              </div>
              <div className="mt-3 space-y-2">
                {chartData.map((d, i) => (
                  <div key={d.key} className="flex items-center gap-3 text-sm">
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: [
                          "#06b6a4",
                          "#0ea5a3",
                          "#f59e0b",
                          "#ec4899",
                          "#3b82f6",
                        ][i % 5],
                      }}
                    />
                    <div className="flex-1">{d.key.replace("_", " / ")}</div>
                    <div className="font-medium">{d.value}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm text-slate-500">
                  Allocated this month
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatCurrency(totalAllocated)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Total allocated across all buckets (this month)
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-slate-500">Spent</div>
                <div className="mt-1 text-lg font-semibold text-rose-600">
                  {formatCurrency(totalSpent)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Remaining: {formatCurrency(totalRemaining)}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm text-slate-600">Quick actions</div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  onClick={() => openTxnModal()}
                  className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200"
                >
                  Add txn
                </button>
                <button
                  onClick={() => openTxnModal("wants")}
                  className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200"
                >
                  Add wants txn
                </button>
                <button
                  onClick={() => router.push("/transactions")}
                  className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200"
                >
                  All transactions
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-slate-500">Bucket breakdown</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  Remaining / Allocated
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Tip: click a bucket to view activity
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {Object.keys(distribution ?? {}).map((k) => {
                const alloc = distribution?.[k] ?? 0;
                const spent = spentByBucket[k] ?? 0;
                const remaining = remainingByBucket[k] ?? alloc;
                const pctOfSalary = Math.round(
                  ((alloc || 0) / Math.max(1, Number(user.salary ?? 1))) * 100
                );
                return (
                  <div key={k} className="border border-gray-50 rounded p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xs text-slate-500">
                          {k.replace("_", " / ")}
                        </div>
                        <div className="text-sm font-medium text-slate-800 mt-1">
                          {formatCurrency(remaining)}{" "}
                          <span className="text-xs text-slate-400 ml-2">
                            left
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-800">
                          {formatCurrency(alloc)}
                        </div>
                        <div className="text-xs text-slate-400">Allocated</div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, pctOfSalary)
                            )}%`,
                            background:
                              "linear-gradient(90deg,#06b6a4,#0ea5a3)",
                          }}
                          className="h-2 rounded-full"
                        />
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-slate-500">
                        <div>
                          {(spentByBucket[k] ?? 0) > 0
                            ? `Spent ${formatCurrency(spentByBucket[k])}`
                            : "No spent"}
                        </div>
                        <button
                          onClick={() => openHistoryModal(k)}
                          className="text-xs text-teal-600"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Previous & Current Salary */}
      <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-slate-500">
                Previous salary (most recent)
              </div>
              {(user.salaryHistory ?? []).length > 0 ? (
                (() => {
                  const last =
                    user.salaryHistory![user.salaryHistory!.length - 1];
                  return (
                    <div className="mt-2">
                      <div className="text-lg font-semibold">
                        {formatCurrency(last.salary)}
                      </div>
                      <div className="text-xs text-slate-400">
                        Start month: {last.startMonth || "—"} • Extra:{" "}
                        {formatCurrency(last.extraIncome ?? 0)}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="mt-2 text-sm text-slate-500">
                  No previous salary recorded
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-sm text-slate-500">Savings (prev)</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {formatCurrency(prevSavings)}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-slate-500">Current salary</div>
              <div className="mt-2 text-lg font-semibold">
                {formatCurrency(Number(user.salary ?? 0))}
              </div>
              <div className="text-xs text-slate-400">
                Start month: {user.startMonth || "—"}
                {user.salaryLockedMonth
                  ? ` • Locked: ${user.salaryLockedMonth}`
                  : ""}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm text-slate-500">Savings (current)</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {formatCurrency(currSavings)}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-600">
            <strong>Total savings right now:</strong>{" "}
            {formatCurrency(totalSavingsNow)}
            <div className="mt-2 text-xs text-slate-400">
              Old + New = total savings across previous and current cycles
              (savings buckets)
            </div>
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section className="mt-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-slate-800">
            Recent activity
          </h3>
          <div className="text-xs text-slate-500">
            {txnLoading ? "Loading..." : `${(txns ?? []).length} items`}
          </div>
        </div>

        <div
          className={`grid gap-3 ${
            (txns ?? []).length > 5 ? "max-h-72 overflow-y-auto pr-1" : ""
          }`}
        >
          {txnLoading ? (
            <div className="p-4 bg-white border rounded">
              Loading transactions…
            </div>
          ) : (txns ?? []).length === 0 ? (
            <div className="p-4 bg-white border rounded text-slate-500">
              No transactions this month. Try adding one.
            </div>
          ) : (
            (txns ?? []).slice(0, 8).map((t) => (
              <div
                key={t.transactionId}
                className="p-3 bg-white rounded flex justify-between items-start"
              >
                <div>
                  <div className="text-sm font-medium">
                    {t.notes ?? t.category ?? "Transaction"}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t.date} • {t.bucket ?? "unspecified"}
                  </div>
                </div>
                <div
                  className={`text-sm font-semibold ${
                    t.amount > 0 ? "text-rose-600" : "text-green-600"
                  }`}
                >
                  {formatCurrency(t.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* History Modal */}
      <Modal
        open={historyModalOpen}
        title={
          historyCategory ? historyCategory.replace("_", " / ") : "History"
        }
        onClose={() => setHistoryModalOpen(false)}
      >
        {historyCategory ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              Recent activity for {historyCategory.replace("_", " / ")}
            </div>
            <div className="divide-y">
              {getHistoryFor(historyCategory).map((tx, idx) => (
                <div
                  key={idx}
                  className="py-3 flex justify-between items-start"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {tx.notes ?? tx.category ?? "Transaction"}
                    </div>
                    <div className="text-xs text-slate-400">{tx.date}</div>
                  </div>
                  <div className="text-sm font-semibold">
                    {formatCurrency(tx.amount)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setHistoryModalOpen(false);
                  openTxnModal(historyCategory ?? undefined);
                }}
                className="px-3 py-2 rounded bg-teal-500 text-white"
              >
                Add txn to this bucket
              </button>
              <button
                onClick={() => {
                  setHistoryModalOpen(false);
                  router.push(`/transactions?bucket=${historyCategory}`);
                }}
                className="px-3 py-2 rounded bg-slate-100"
              >
                Open full history
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No category selected.</div>
        )}
      </Modal>

      <TransactionModal
        open={txnModalOpen}
        onClose={() => setTxnModalOpen(false)}
        onSave={handleSaveTxn}
        defaultBucket={txnDefaultBucket}
      />
    </main>
  );
}
