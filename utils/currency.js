export function formatCurrency(amount) {
  const formatted = Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return `KSh ${formatted}`;
}
