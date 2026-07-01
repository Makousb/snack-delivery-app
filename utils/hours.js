// A simple daily open/close window per vendor. When either time is unset the
// vendor is treated as always open. Overnight windows (e.g. 18:00–02:00) are
// handled. Times are compared in the server's local timezone.
function toMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function isVendorOpen(vendor, now = new Date()) {
  const open = toMinutes(vendor?.opening_time);
  const close = toMinutes(vendor?.closing_time);

  if (open == null || close == null || open === close) {
    return true; // hours not set (or a full-day window) → always open
  }

  const current = now.getHours() * 60 + now.getMinutes();

  return open < close
    ? current >= open && current < close
    : current >= open || current < close; // overnight
}

export function vendorOpenStatus(vendor, now = new Date()) {
  const open = isVendorOpen(vendor, now);
  return { open, label: open ? "Open now" : "Closed" };
}

export function formatVendorHours(vendor) {
  if (!vendor?.opening_time || !vendor?.closing_time) return "Open 24/7";
  const hhmm = (time) => String(time).slice(0, 5);
  return `${hhmm(vendor.opening_time)} – ${hhmm(vendor.closing_time)}`;
}
