// components/TransactionModal.tsx
"use client";
import React, { useState } from "react";
import { Modal } from "@/modals/Modal";

export default function TransactionModal({
  open,
  onClose,
  onSave,
  defaultBucket
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: { amount: number; bucket?: string; category?: string; notes?: string; date?: string }) => Promise<void> | void;
  defaultBucket?: string;
}) {
  const [amount, setAmount] = useState<number | string>("");
  const [bucket, setBucket] = useState<string | undefined>(defaultBucket);
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function reset() {
    setAmount("");
    setBucket(defaultBucket);
    setCategory("");
    setNotes("");
    setErr("");
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErr("");
    const amt = Number(amount);
    if (!amt || Number.isNaN(amt)) return setErr("Enter a valid amount");
    setSaving(true);
    try {
      await onSave({ amount: amt, bucket, category, notes, date: new Date().toISOString().slice(0,10) });
      reset();
      onClose();
    } catch (err: any) {
      setErr(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Add transaction" onClose={onClose}>
      <form onSubmit={handleSave} className="grid gap-3">
        <label className="text-sm">
          Amount (₹)
          <input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="e.g., 1200"
          />
        </label>

        <label className="text-sm">
          Bucket
          <input value={bucket ?? ""} onChange={(e) => setBucket(e.target.value)} className="w-full p-2 border rounded" placeholder="wants / needs / savings" />
        </label>

        <label className="text-sm">
          Category
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2 border rounded" placeholder="Groceries / Netflix" />
        </label>

        <label className="text-sm">
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2 border rounded" placeholder="Optional note" />
        </label>

        {err && <div className="text-sm text-red-500">{err}</div>}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="px-3 py-2 bg-teal-500 text-white rounded">
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={() => { reset(); onClose(); }} className="px-3 py-2 bg-slate-100 rounded">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
