import axios from "axios";
import { config } from "../config/env.js";

// SMS order updates via Africa's Talking. Opt-in like email: without
// SMS_ENABLED + credentials every send is a silent no-op, so checkout and
// status updates never depend on the SMS provider being configured.

export function isSmsConfigured() {
  return (
    config.sms.enabled && Boolean(config.sms.apiKey && config.sms.username)
  );
}

// Normalize the common Kenyan formats to E.164 (+254...). Anything already
// in international format passes through; anything unrecognizable returns
// null so we skip the send instead of erroring.
export function normalizePhone(raw) {
  const cleaned = String(raw || "").replace(/[^\d+]/g, "");

  if (!cleaned) return null;
  if (/^\+\d{10,14}$/.test(cleaned)) return cleaned;
  if (/^254\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0[17]\d{8}$/.test(cleaned)) return `+254${cleaned.slice(1)}`;

  return null;
}

// Customer-facing one-liner for a status change. Statuses a customer
// doesn't care about return null and send nothing.
export function statusSmsMessage(orderId, status, { isPickup = false, isService = false } = {}) {
  const noun = isService ? "booking" : "order";

  const messages = {
    Paid: `Snack ${noun} #${orderId}: payment received. The ${isService ? "provider" : "vendor"} is on it.`,
    Preparing: `Snack order #${orderId}: the vendor is preparing your order.`,
    "Ready for Pickup": `Snack order #${orderId} is ready for pickup — see your order page for pickup details.`,
    "Driver Assigned": `Snack order #${orderId}: a driver has been assigned and is heading to the vendor.`,
    "Out for Delivery": `Snack order #${orderId} is on its way to you.`,
    Confirmed: `Snack booking #${orderId}: the provider has confirmed your appointment.`,
    "In Progress": `Snack booking #${orderId}: the provider has started your service.`,
    Completed: isService
      ? `Snack booking #${orderId} is complete. Thanks for using Snack!`
      : isPickup
        ? `Snack order #${orderId} is complete. Enjoy!`
        : `Snack order #${orderId} has been delivered. Enjoy!`
  };

  return messages[status] || null;
}

// Fire-and-forget send: failures are logged and never surface to the
// request that triggered them.
export async function sendOrderSms(phone, message) {
  if (!isSmsConfigured() || !message) return;

  const to = normalizePhone(phone);
  if (!to) return;

  try {
    await axios.post(
      config.sms.endpoint,
      new URLSearchParams({
        username: config.sms.username,
        to,
        message,
        ...(config.sms.from ? { from: config.sms.from } : {})
      }).toString(),
      {
        headers: {
          apiKey: config.sms.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        timeout: 10000
      }
    );
  } catch (error) {
    console.error("SMS send failed:", error.message);
  }
}
