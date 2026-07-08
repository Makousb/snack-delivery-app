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

// Human label for a scheduled-order time: "Today 14:30", "Tomorrow 09:00",
// or "Mon 12 Jan, 10:00" further out.
export function formatSlotLabel(date, now = new Date()) {
  const slot = new Date(date);
  const time = slot.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(slot) - startOfDay(now)) / 86400000);

  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  return `${slot.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

// Pickup/delivery slots for scheduled orders: half-hour marks over the next
// `days` days, only while the vendor is open, starting `leadMinutes` from now
// so the kitchen always has prep time.
export function generateOrderSlots(
  vendor,
  { days = 2, intervalMinutes = 30, leadMinutes = 45, maxSlots = 48, now = new Date() } = {}
) {
  const slots = [];

  const first = new Date(now.getTime() + leadMinutes * 60000);
  first.setSeconds(0, 0);
  const remainder = first.getMinutes() % intervalMinutes;
  if (remainder) {
    first.setMinutes(first.getMinutes() + (intervalMinutes - remainder));
  }

  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);

  for (
    let slot = new Date(first);
    slot < end && slots.length < maxSlots;
    slot = new Date(slot.getTime() + intervalMinutes * 60000)
  ) {
    if (!isVendorOpen(vendor, slot)) continue;
    slots.push({ value: slot.toISOString(), label: formatSlotLabel(slot, now) });
  }

  return slots;
}
