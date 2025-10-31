export function formatCurrency(amount?: number | null, currency = "INR") {
  const n = Number(amount ?? 0);
  if (!isFinite(n) || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}
