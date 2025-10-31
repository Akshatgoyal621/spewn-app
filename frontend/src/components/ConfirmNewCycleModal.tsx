// components/ConfirmNewCycleModal.tsx
"use client";
import React, { useState } from "react";
import { Modal } from "@/modals/Modal";

export default function ConfirmNewCycleModal({
  open,
  onClose,
  onConfirm,
  defaultStartMonth
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { startMonth: string; extraIncome: number }) => Promise<void> | void;
  defaultStartMonth?: string;
}) {
  const [startMonth, setStartMonth] = useState<string>(defaultStartMonth || "");
  const [extraIncome, setExtraIncome] = useState<number | string>("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function validate() {
    if (!startMonth) {
      setErr("Choose a start month");
      return false;
    }
    if (!/^\d{4}-\d{2}$/.test(startMonth)) {
      setErr("start month must be YYYY-MM");
      return false;
    }
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

  return (
    <Modal open={open} title="Start a new salary cycle?" onClose={onClose}>
      <form onSubmit={handleConfirm} className="grid gap-3">
        <div className="text-sm text-slate-600">
          Starting a new cycle will record your previous salary in history and lock the chosen month's salary (it cannot be changed for that month).
        </div>

        <label className="text-sm">
          Start month
          <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className="w-full p-2 border rounded mt-1" />
        </label>

        <label className="text-sm">
          Extra income for the month (optional)
          <input type="number" value={extraIncome as any} onChange={(e) => setExtraIncome(e.target.value === "" ? "" : Number(e.target.value))} className="w-full p-2 border rounded mt-1" placeholder="e.g., 5000" />
        </label>

        {err && <div className="text-sm text-red-500">{err}</div>}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="px-3 py-2 bg-teal-500 text-white rounded">{saving ? "Saving..." : "Start new cycle"}</button>
          <button type="button" onClick={() => { setErr(""); onClose(); }} className="px-3 py-2 bg-slate-100 rounded">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
