"use client";

import React, {useMemo, useEffect, useState, useRef} from "react";
import {useRouter} from "next/navigation";
import {useAuth} from "../../lib/auth-client";
import {DonutChart} from "@/charts/DonutChart";
import {formatCurrency} from "@/utils/formatCurrency";
import {useDeviceType} from "@/utils/useDeviceType";
import {motion} from "framer-motion";
import {
  get,
  isEmpty,
  keys as _keys,
  map as _map,
  sum as _sum,
  round as _round,
} from "lodash";

/*
  DashboardInner (refactored + fixes)
  - fixes: first-load transactions, delete optimistic-only txns, no truncation of state
  - improvements: memoized month filtering, robust date parsing, better defaults
*/

type SplitMap = Record<string, number>;

type UserProfile = {
  id: string;
  email?: string;
  name?: string;
  salary?: number;
  splits?: SplitMap;
  distribution?: Record<string, number>;
  preset?: string;
  currency?: string;
  subscribed?: boolean;
  automate?: boolean;
  activeTracking?: boolean;
  salaryHistory?: Array<{
    salary: number;
    startMonth?: string;
    extraIncome?: number;
    splits?: SplitMap;
  }>;
  salaryLockedMonth?: string;
  startMonth?: string;
};

type ChartDatum = {key: string; value: number};

type Txn = {
  _id?: string;
  userId: string;
  bucket: string;
  category?: string;
  amount: number;
  createdAt?: string;
};

export default function DashboardPage() {
  return <DashboardInner />;
}

function useKeyNavigation(listLength: number) {
  const [highlight, setHighlight] = useState(-1);
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(listLength - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(-1, h - 1));
    } else if (e.key === "Escape") {
      setHighlight(-1);
    }
  }
  return {highlight, setHighlight, onKey};
}

function DashboardInner() {
  const {isMobile} = useDeviceType();
  const router = useRouter();
  const {user, fetchMe} = useAuth() as {
    user?: UserProfile | null;
    fetchMe?: () => Promise<void>;
  };

  const CARD_MIN_HEIGHT = 520; // px, ensures both side-by-side cards look equal

  // transactions state (client-side mirrored from server)
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);

  // Add modal (global)
  const [openAddModal, setOpenAddModal] = useState(false);
  const [newBucket, setNewBucket] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [newSubCategory, setNewSubCategory] = useState<string>(""); // for subscriptions
  const [newAmount, setNewAmount] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bucket-details modal
  const [openBucketModal, setOpenBucketModal] = useState(false);
  const [activeBucket, setActiveBucket] = useState<string | null>(null);

  // category autocomplete state
  const [catInput, setCatInput] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement | null>(null);

  // keyboard nav for suggestions
  const {highlight, setHighlight, onKey} = useKeyNavigation(10);

  // Category suggestions by bucket (normalized keys)
  const categorySuggestions: Record<string, string[]> = {
    savings: ["SIP", "RD", "FD", "Stocks", "Other"],
    parents_preserve: ["Parents", "Preserve", "Other"],
    extras: ["Other"],
    wants: ["Dinner out", "Subscriptions", "Shopping", "Other"],
    needs: [
      "Rent",
      "Electricity bill",
      "Water bill",
      "Fuel/Commuting cost",
      "Other",
    ],
  };

  // Distribution: prefer explicit distribution, otherwise compute from salary + splits
  const distribution = useMemo<Record<string, number> | null>(() => {
    if (!user) return null;

    const explicit = get(user, "distribution", null) as Record<
      string,
      number
    > | null;
    if (explicit && !isEmpty(explicit) && _keys(explicit).length > 0)
      return explicit;

    // fallback: compute from salary + splits
    try {
      const salaryNum = Number(get(user, "salary", 0));
      const splits = get(user, "splits", {}) as SplitMap;
      const splitKeys = _keys(splits);
      if (salaryNum <= 0 || splitKeys.length === 0) return null;

      const comp: Record<string, number> = {};
      splitKeys.forEach((k: string) => {
        const pct = Number(splits[k] ?? 0);
        comp[k] = _round((salaryNum * pct) / 100);
      });
      return comp;
    } catch {
      return null;
    }
  }, [user]);

  const chartData: ChartDatum[] = useMemo(() => {
    const splits = get(user, "splits", {}) as SplitMap;
    if (isEmpty(splits)) return [];
    return _map(_keys(splits), (k: string) => ({
      key: k,
      value: Number(splits[k] ?? 0),
    }));
  }, [user?.splits]);

  // spentByBucket is computed by summing transactions per bucket
  const spentByBucket: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      map[t.bucket] = (map[t.bucket] || 0) + Number(t.amount || 0);
    });
    return map;
  }, [transactions]);

  const totalAllocated = _sum(
    _map(_keys(distribution ?? {}), (k: string) =>
      Number(distribution?.[k] ?? 0)
    )
  );
  const totalSpent = _sum(
    _map(_keys(spentByBucket), (k: any) => spentByBucket[k])
  );
  const totalRemaining = totalAllocated - totalSpent;

  function onEdit(): void {
    router.push("/onboarding");
  }

  // ----- Transactions fetching & syncing -----
  async function loadTxns() {
    if (!user) return;
    setLoadingTxns(true);
    try {
      // ask the backend for all transactions; many APIs accept ?limit=0 to mean "no limit"
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/transactions?limit=0`,
        {
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Failed to load transactions");
      const data = await res.json();

      // ensure we store the full list (server is source of truth)
      // expected: data.transactions is an array sorted newest-first
      setTransactions(
        Array.isArray(data.transactions) ? data.transactions : []
      );
    } catch (e) {
      console.error("loadTxns failed:", e);
      // don't change state further — keep whatever is present
    } finally {
      setLoadingTxns(false);
    }
  }

  // load txns on user change (and fetchMe if available)
  useEffect(() => {
    if (!user?.id) return;
    // call in microtask so UI can render first
    (async () => {
      await loadTxns();
      if (fetchMe) {
        try {
          await fetchMe();
        } catch (err) {
          // ignore fetchMe errors silently
          console.warn("fetchMe failed:", err);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // optimistic map store for rollback (not strictly required but kept)
  const optimisticMapRef = useRef<Map<string, Txn>>(new Map());

  // unified add transaction handler (supports bucket override for bucket modal)
  async function handleAddTransaction(
    e?: React.FormEvent,
    bucketOverride?: string
  ) {
    e?.preventDefault();
    if (!user) return setError("Not authenticated");
    setError(null);
    const bucketToUse = bucketOverride ?? newBucket;
    const amt = Number(newAmount || 0);
    const categoryToUse =
      newCategory === "Subscriptions"
        ? `${newCategory} • ${newSubCategory || "—"}`
        : newCategory || undefined;

    if (!bucketToUse || !amt || amt <= 0) return setError("Invalid input");

    // check negative allocation situation
    const futureTotalSpent = totalSpent + amt;
    const futureRemaining = totalAllocated - futureTotalSpent;

    if (futureRemaining < 0) {
      const confirmMsg = `This spend will exceed your allocation by ${formatCurrency(
        Math.abs(futureRemaining)
      )}. Do you want to proceed?`;
      const ok = window.confirm(confirmMsg);
      if (!ok) return; // user aborted
    }

    setSaving(true);
    try {
      const payload = {
        bucket: bucketToUse,
        category: categoryToUse || undefined,
        amount: amt,
      };

      // optimistic update: add to UI immediately (newest first)
      const optimism: Txn = {
        userId: user.id,
        bucket: bucketToUse,
        category: categoryToUse,
        amount: amt,
        createdAt: new Date().toISOString(),
      };

      // create temporary id for optimistic tracking
      const tempId = `temp_${Date.now()}`;
      optimisticMapRef.current.set(tempId, optimism);

      // optimistic update — do NOT slice away older transactions
      setTransactions((prev) => [{...optimism, _id: tempId}, ...prev]);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/transactions`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to save");
      }

      // server will return canonical data; reload
      await loadTxns();
      if (fetchMe) await fetchMe();

      // clear modal(s)
      setOpenAddModal(false);
      setNewBucket("");
      setNewCategory("");
      setNewSubCategory("");
      setNewAmount("");
    } catch (err: any) {
      console.error("add txn failed:", err);
      setError(err?.message || "Failed to save transaction");
      // rollback optimistic if needed (reload server copy)
      await loadTxns();
    } finally {
      setSaving(false);
    }
  }

  // delete transaction (optimistic). If txnId is a temp optimistic id, remove locally.
  async function handleDeleteTransaction(txnId?: string) {
    if (!txnId) return;
    const ok = window.confirm(
      "Delete this transaction? This cannot be undone."
    );
    if (!ok) return;

    // If this is an optimistic-only temp id (we created it locally), just remove locally
    if (String(txnId).startsWith("temp_")) {
      setTransactions((prev) => prev.filter((t) => t._id !== txnId));
      optimisticMapRef.current.delete(txnId);
      return;
    }

    // optimistic removal for server-backed txn
    const before = transactions;
    setTransactions((prev) => prev.filter((t) => t._id !== txnId));

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/transactions/${txnId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "Failed to delete");
      }
      // reload to be safe / canonical
      await loadTxns();
    } catch (err) {
      console.error("delete txn failed:", err);
      // rollback
      setTransactions(before);
      alert("Failed to delete transaction. Please try again.");
    }
  }

  // open bucket details modal
  function openBucketDetails(bucket: string) {
    setActiveBucket(bucket);
    setOpenBucketModal(true);
  }

  // close bucket modal
  function closeBucketModal() {
    setOpenBucketModal(false);
    setActiveBucket(null);
    setNewCategory("");
    setNewSubCategory("");
    setNewAmount("");
  }

  // small helper to normalize bucket key to suggestions key
  function suggestionKeyForBucket(k: string) {
    return k.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }

  // autocomplete helpers (client-side suggestions)
  const currentSuggestions = useMemo(() => {
    const key = suggestionKeyForBucket(activeBucket || newBucket || "");
    const base = categorySuggestions[key] || [];
    if (!catInput) return base;
    return base.filter((s) => s.toLowerCase().includes(catInput.toLowerCase()));
  }, [activeBucket, newBucket, catInput]);

  useEffect(() => {
    // reset highlight when suggestion input changes
    setHighlight(-1);
  }, [catInput, setHighlight]);

  // close autocomplete on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!catRef.current) return;
      if (!catRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // ----- All-transactions modal state & helpers -----
  const [openAllTxnsModal, setOpenAllTxnsModal] = useState(false);
  const [txnSearch, setTxnSearch] = useState("");

  // memoized list of transactions that occurred this month (local timezone)
  const transactionsThisMonth = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // zero-based
    return transactions.filter((t) => {
      if (!t?.createdAt) return false;
      const d = new Date(t.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
  }, [transactions]);

  // memoized filtered list by search
  const filteredMonthTxns = useMemo(() => {
    const list = transactionsThisMonth;
    if (!txnSearch?.trim()) return list;
    const q = txnSearch.trim().toLowerCase();
    return list.filter((t) => {
      return (
        (t.category || "").toLowerCase().includes(q) ||
        (t.bucket || "").toLowerCase().includes(q) ||
        String(t.amount || "").includes(q)
      );
    });
  }, [transactionsThisMonth, txnSearch]);

  // export CSV (small client-side impl)
  function exportTransactionsCSV(txns: Txn[]) {
    if (!txns || txns.length === 0) {
      alert("No transactions to export.");
      return;
    }
    const rows = [
      ["id", "bucket", "category", "amount", "createdAt"],
      ...txns.map((t) => [
        t._id ?? "",
        (t.bucket || "").replace(/"/g, '""'),
        (t.category || "").replace(/"/g, '""'),
        String(t.amount ?? ""),
        t.createdAt ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Auth verifying user:
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

  // --- Render ---
  return (
    <main className="py-8 px-4 lg:px-12">
      {/* Header */}
      <div className="w-full">
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold text-teal-600 leading-tight">
                Welcome,{" "}
                <span className="text-teal-600">{get(user, "name", "—")}</span>
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Here’s how your salary is distributed this month.
              </p>
            </div>

            <div className="flex items-center gap-2 ">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium truncate ${
                  get(user, "automate", false)
                    ? "bg-green-50 text-green-800"
                    : "bg-yellow-50 text-yellow-800"
                }`}
                title={
                  get(user, "automate", false)
                    ? `Automate: ON (start ${get(user, "startMonth", "—")})`
                    : "Automate: OFF"
                }
              >
                {get(user, "automate", false)
                  ? `Automate: ON (start ${get(user, "startMonth", "—")})`
                  : "Automate: OFF"}
              </span>

              <span
                className={`px-3 py-1 rounded-full text-xs font-medium truncate ${
                  get(user, "subscribed", false)
                    ? "bg-teal-50 text-teal-800"
                    : "bg-red-50 text-red-700"
                }`}
                title={
                  get(user, "subscribed", false)
                    ? "Subscribed"
                    : "Free • Subscribe"
                }
              >
                {get(user, "subscribed", false)
                  ? "Subscribed"
                  : "Free • Subscribe"}
              </span>

              <span
                className={`px-3 py-1 rounded-full text-xs font-medium truncate ${
                  get(user, "activeTracking", false)
                    ? "bg-indigo-50 text-indigo-800"
                    : "bg-slate-100 text-slate-700"
                }`}
                title={
                  get(user, "activeTracking", false)
                    ? "Active tracking"
                    : "Manual / Preview"
                }
              >
                {get(user, "activeTracking", false)
                  ? "Active tracking"
                  : "Manual / Preview"}
              </span>
            </div>

            <div className="flex items-start justify-end gap-3">
              <div className="hidden sm:flex flex-col text-sm text-slate-600 mr-2 min-w-[12rem]">
                <div className="truncate">
                  Preset:{" "}
                  <span className="font-medium text-slate-800">
                    {String(get(user, "preset", "—")).toUpperCase()}
                  </span>
                </div>
                <div className="mt-1 truncate">
                  Salary:{" "}
                  <span className="font-medium text-slate-800">
                    {formatCurrency(get(user, "salary", 0))}
                  </span>
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
                    {String(get(user, "preset", "—")).toUpperCase()}
                  </span>
                </div>
                <div className="mt-1">
                  Salary:{" "}
                  <span className="font-medium text-slate-800">
                    {formatCurrency(get(user, "salary", 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <section className="mt-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left card: Donut + Allocated */}
          <div
            className="w-full lg:w-1/2 bg-white rounded-2xl p-4 md:p-5 border border-gray-100 shadow-sm"
            style={{minHeight: CARD_MIN_HEIGHT}}
          >
            <div
              className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6"
              style={{height: "100%"}}
            >
              {/* Donut */}
              <div className="flex-shrink-0 flex items-center justify-center">
                <div className="w-[120px] h-[120px]">
                  <DonutChart data={chartData} size={120} />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-sm text-slate-600">
                    Distribution (percent)
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {chartData.map((d, i) => (
                      <div
                        key={d.key}
                        className="flex items-center gap-3 text-sm"
                      >
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
                        <div className="flex-1 truncate">
                          {d.key.replace("_", " / ")}
                        </div>
                        <div className="font-medium">{d.value}%</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 border-t pt-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm text-slate-500">
                          Allocated this month
                        </div>
                        <div className="mt-1 text-xl md:text-2xl font-semibold text-teal-600">
                          {formatCurrency(totalAllocated)}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {isMobile
                            ? ""
                            : "Total allocated across all buckets (this month)"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-500">Spent</div>
                        <div
                          className={`mt-1 text-lg font-semibold ${
                            totalRemaining < 0
                              ? "text-rose-600"
                              : "text-rose-600"
                          }`}
                        >
                          {formatCurrency(totalSpent)}
                        </div>
                        <div
                          className={`text-xs mt-1 ${
                            totalRemaining < 0
                              ? "text-rose-600"
                              : "text-slate-400"
                          }`}
                        >
                          Remaining: {formatCurrency(totalRemaining)}{" "}
                          {totalRemaining < 0 && (
                            <span className="ml-2 font-medium">
                              (Over by{" "}
                              {formatCurrency(Math.abs(totalRemaining))})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* actions */}
                    <div className="mt-3">
                      <div className="text-sm text-slate-600">
                        Quick actions
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={onEdit}
                          className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200 text-sm"
                          type="button"
                        >
                          Edit inputs
                        </button>

                        <button
                          onClick={() => {
                            setOpenAddModal(true);
                            setNewBucket("");
                          }}
                          className="px-3 py-2 rounded bg-teal-600 text-white text-sm hover:brightness-95"
                          type="button"
                        >
                          Add spend
                        </button>

                        <button
                          onClick={() => {
                            console.log("Export in progress...");
                          }}
                          className="px-3 py-2 rounded bg-teal-600 text-white text-sm hover:brightness-95"
                          type="button"
                        >
                          Export
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* recent txns: bottom */}
                <div className="mt-3 border-t pt-3" style={{width: "100%"}}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-600">
                      Recent transactions
                    </div>
                    <div className="text-xs text-slate-400">
                      Showing latest 10
                    </div>
                  </div>

                  <div className="mt-3 max-h-[480px] overflow-auto">
                    {loadingTxns ? (
                      <div className="text-sm text-slate-400">Loading…</div>
                    ) : (
                      <div className="space-y-2">
                        {transactions.length === 0 && (
                          <div className="text-xs text-slate-400">
                            No transactions yet — add one using Add spend.
                          </div>
                        )}

                        {transactions.slice(0, 10).map((t) => (
                          <div
                            key={t._id ?? t.createdAt}
                            className="flex justify-between items-center bg-slate-50 rounded p-2"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">
                                {t.category ?? t.bucket}
                              </div>
                              <div className="text-xs text-slate-400 truncate">
                                {t.bucket} •{" "}
                                {t.createdAt
                                  ? new Date(t.createdAt).toLocaleString()
                                  : ""}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 ml-4">
                              <div className="text-sm font-semibold text-rose-600">
                                -{formatCurrency(t.amount)}
                              </div>
                              <button
                                onClick={() => handleDeleteTransaction(t._id)}
                                className="text-xs text-slate-500"
                                type="button"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setTxnSearch("");
                      setOpenAllTxnsModal(true);
                    }}
                    className="mt-4 px-3 py-2 rounded border border-slate-200 text-sm bg-teal-600 text-white hover:brightness-95"
                    type="button"
                  >
                    Show all transactions
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right card: Buckets (clickable) */}
          <div
            className="w-full lg:w-1/2 bg-white rounded-2xl border border-gray-100 shadow-sm"
            style={{minHeight: CARD_MIN_HEIGHT}}
          >
            <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-slate-500">Buckets</div>
                <div className="text-xs text-slate-400">
                  Tap a tile to view details or add spends
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {_map(_keys(distribution ?? {}), (k: string, idx: number) => {
                  const alloc = Number(distribution?.[k] ?? 0);
                  const spent = spentByBucket[k] ?? 0;
                  const remainingRaw = alloc - (spent || 0);
                  const remaining = Math.max(0, remainingRaw);
                  const pct =
                    alloc > 0
                      ? Math.min(100, Math.round((spent / alloc) * 100))
                      : 0;

                  const accent = "#06b6a4";
                  const friendlyName = k.replace("_", " / ");

                  return (
                    <div
                      key={k}
                      className="w-full bg-white border border-gray-100 rounded-lg p-3 shadow-sm"
                    >
                      {/* Row 1: icon + name */}
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-md text-white font-semibold flex items-center justify-center flex-shrink-0"
                          style={{background: accent}}
                          aria-hidden
                        >
                          {friendlyName
                            .split(/[\s\/]/)
                            .map((s) => s[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {friendlyName}
                          </div>
                          <div className="text-xs text-slate-500">Bucket</div>
                        </div>

                        {/* remaining amount on the right for wider screens */}
                        <div className="ml-auto text-right">
                          <div className="text-base font-semibold text-slate-900">
                            {formatCurrency(remaining)}
                          </div>
                          <div className="text-xs text-slate-400">left</div>
                        </div>
                      </div>

                      {/* Row 2: progress bar */}
                      <div className="mt-3">
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background:
                                "linear-gradient(90deg,#06b6a4,#0ea5a3)",
                            }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                          <div>{pct}% used</div>
                          {remainingRaw < 0 ? (
                            <div className="text-rose-600 font-medium">
                              Over by {formatCurrency(Math.abs(remainingRaw))}
                            </div>
                          ) : (
                            <div className="text-slate-500"></div>
                          )}
                        </div>
                      </div>

                      {/* Row 3: small stats */}
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <div>
                          Spent:{" "}
                          <span className="text-rose-600 font-medium">
                            {formatCurrency(spent)}
                          </span>
                        </div>
                        <div className="hidden sm:block">
                          Allocated:{" "}
                          <span className="text-slate-700 font-medium">
                            {formatCurrency(alloc)}
                          </span>
                        </div>
                      </div>

                      {/* Row 4: actions */}
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openBucketDetails(k);
                          }}
                          className="w-full px-3 py-2 rounded text-sm font-medium border border-slate-200 text-teal-600 hover:bg-slate-50"
                          aria-label={`View ${friendlyName}`}
                        >
                          View
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNewBucket(k);
                            setOpenAddModal(true);
                          }}
                          className="w-full px-3 py-2 rounded text-sm font-medium bg-teal-600 text-white hover:brightness-95"
                          aria-label={`Add spend to ${friendlyName}`}
                        >
                          Add spend
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Add Transaction Modal (general) */}
      {openAddModal && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center"
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
        >
          {/* overlay: soft translucent white + blur */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setOpenAddModal(false)}
          />

          <motion.form
            onSubmit={(e: any) => handleAddTransaction(e)}
            className="relative bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-lg z-10"
            initial={{y: 20, scale: 0.98}}
            animate={{y: 0, scale: 1}}
            onClick={(e: any) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-teal-600">Add spend</h3>
              <button
                type="button"
                onClick={() => setOpenAddModal(false)}
                className="text-slate-500"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Bucket</label>
                <select
                  value={newBucket}
                  onChange={(e) => setNewBucket(e.target.value)}
                  className="w-full mt-1 p-2 border rounded"
                >
                  <option value="">Select bucket</option>
                  {_map(_keys(distribution ?? {}), (k: string) => (
                    <option key={k} value={k}>
                      {k.replace("_", " / ")}
                    </option>
                  ))}
                </select>
              </div>

              <div ref={catRef}>
                <label className="text-xs text-slate-500">
                  Category (optional)
                </label>
                <div className="relative">
                  <input
                    value={newCategory}
                    onChange={(e) => {
                      setNewCategory(e.target.value);
                      setCatInput(e.target.value);
                      setCatOpen(true);
                    }}
                    onKeyDown={onKey}
                    className="w-full mt-1 p-2 border rounded"
                    placeholder="e.g., groceries, fuel, Subscriptions"
                  />

                  {/* suggestion box */}
                  {catOpen && currentSuggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 bg-white border rounded mt-1 max-h-40 overflow-auto shadow-sm">
                      {currentSuggestions.map((s, idx) => (
                        <div
                          key={s}
                          className={`p-2 text-sm cursor-pointer ${
                            highlight === idx ? "bg-slate-100" : ""
                          }`}
                          onMouseEnter={() => setHighlight(idx)}
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            setNewCategory(s);
                            setCatOpen(false);
                            setCatInput("");
                          }}
                        >
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Subcategory input when user chose Subscriptions */}
              {newCategory === "Subscriptions" && (
                <div>
                  <label className="text-xs text-slate-500">Which app?</label>
                  <input
                    value={newSubCategory}
                    onChange={(e) => setNewSubCategory(e.target.value)}
                    className="w-full mt-1 p-2 border rounded"
                    placeholder="e.g., Netflix, Spotify"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-slate-500">Amount</label>
                <input
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  inputMode="numeric"
                  className="w-full mt-1 p-2 border rounded"
                  placeholder="0"
                />
              </div>

              {error && <div className="text-rose-600 text-sm">{error}</div>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenAddModal(false)}
                  className="px-4 py-2 rounded bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded bg-teal-600 text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </motion.form>
        </motion.div>
      )}

      {/* Bucket Details Modal */}
      {openBucketModal && activeBucket && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(6px)",
            }}
            onClick={closeBucketModal}
          />

          <motion.div
            className="relative bg-white rounded-2xl p-6 w-full max-w-2xl mx-4 shadow-lg z-10"
            initial={{y: 20, scale: 0.98}}
            animate={{y: 0, scale: 1}}
            onClick={(e: any) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-teal-600">
                {activeBucket.replace("_", " / ")}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={closeBucketModal} className="text-slate-500">
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Left: list of transactions for this bucket */}
              <div>
                <div className="text-sm text-slate-600 mb-3">Transactions</div>
                <div className="space-y-2 max-h-80 overflow-auto pr-2">
                  {transactions.filter((t) => t.bucket === activeBucket)
                    .length === 0 && (
                    <div className="text-xs text-slate-400">
                      No transactions for this bucket yet.
                    </div>
                  )}
                  {transactions
                    .filter((t) => t.bucket === activeBucket)
                    .map((t) => (
                      <div
                        key={t._id ?? t.createdAt}
                        className="flex justify-between items-center bg-slate-50 rounded p-2"
                      >
                        <div>
                          <div className="font-medium text-sm">
                            {t.category ?? "—"}
                          </div>
                          <div className="text-xs text-slate-400">
                            {t.createdAt
                              ? new Date(t.createdAt).toLocaleString()
                              : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-semibold text-rose-600">
                            -{formatCurrency(t.amount)}
                          </div>
                          <button
                            onClick={() => handleDeleteTransaction(t._id)}
                            className="text-xs text-slate-500"
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Right: quick add */}
              <div>
                <div className="text-sm text-slate-600 mb-3">Quick add</div>
                <form
                  onSubmit={(e) => handleAddTransaction(e, activeBucket)}
                  className="space-y-3"
                >
                  <div>
                    <label className="text-xs text-slate-500">
                      Category (optional)
                    </label>
                    <input
                      list={`${suggestionKeyForBucket(activeBucket)}-cats`}
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full mt-1 p-2 border rounded"
                    />
                    <datalist
                      id={`${suggestionKeyForBucket(activeBucket)}-cats`}
                    >
                      {(
                        categorySuggestions[
                          suggestionKeyForBucket(activeBucket)
                        ] || []
                      ).map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  {newCategory === "Subscriptions" && (
                    <div>
                      <label className="text-xs text-slate-500">
                        Which app?
                      </label>
                      <input
                        value={newSubCategory}
                        onChange={(e) => setNewSubCategory(e.target.value)}
                        className="w-full mt-1 p-2 border rounded"
                        placeholder="e.g., Netflix"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-slate-500">Amount</label>
                    <input
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      inputMode="numeric"
                      className="w-full mt-1 p-2 border rounded"
                      placeholder="0"
                    />
                  </div>

                  {error && (
                    <div className="text-rose-600 text-sm">{error}</div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeBucketModal}
                      className="px-4 py-2 rounded bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 rounded bg-teal-600 text-white disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* All Transactions Modal - shows transactions for the current month */}
      {openAllTxnsModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4">
          {/* backdrop */}
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(3px)",
            }}
            onClick={() => setOpenAllTxnsModal(false)}
          />
          <div
            className="relative w-full max-w-4xl bg-white rounded-2xl shadow-lg z-10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="All transactions this month"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <div className="text-lg font-semibold text-teal-600">
                  Transactions — This month
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Showing {transactionsThisMonth.length} total • Total:{" "}
                  <span className="font-medium">
                    {formatCurrency(
                      filteredMonthTxns.reduce(
                        (s, t) => s + Number(t.amount || 0),
                        0
                      )
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={txnSearch}
                  onChange={(e) => setTxnSearch(e.target.value)}
                  placeholder="Search bucket, category, amount..."
                  className="px-3 py-2 border rounded text-sm"
                  type="search"
                />
                <button
                  onClick={() => exportTransactionsCSV(filteredMonthTxns)}
                  className="px-3 py-2 rounded bg-teal-600 text-white text-sm"
                  type="button"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => setOpenAllTxnsModal(false)}
                  className="px-3 py-2 rounded bg-slate-100 text-sm"
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto p-4">
              {loadingTxns ? (
                <div className="text-sm text-slate-500">
                  Loading transactions…
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMonthTxns.length === 0 ? (
                    <div className="text-sm text-slate-400">
                      No transactions found for this month.
                    </div>
                  ) : (
                    filteredMonthTxns.map((t) => (
                      <div
                        key={t._id ?? t.createdAt}
                        className="flex items-center justify-between bg-slate-50 p-3 rounded"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {t.category ?? "—"}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {t.bucket} •{" "}
                            {t.createdAt
                              ? new Date(t.createdAt).toLocaleString()
                              : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 ml-4">
                          <div className="text-sm font-semibold text-rose-600">
                            {formatCurrency(t.amount)}
                          </div>
                          <button
                            onClick={() => {
                              const ok = window.confirm(
                                "Delete this transaction?"
                              );
                              if (!ok) return;
                              handleDeleteTransaction(t._id);
                            }}
                            className="text-xs text-slate-500"
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
