import nodemailer from "nodemailer";
import { config, isEmailConfigured } from "../config/env.js";
import { formatCurrency } from "../utils/currency.js";

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: { user: config.email.user, pass: config.email.pass }
    });
  }
  return transporter;
}

// Send an order confirmation. No-ops (returns false) when email isn't
// configured, and never throws — a mail failure must not break checkout.
export async function sendOrderConfirmation({ to, order, items, vendorName }) {
  if (!to || !isEmailConfigured()) return false;

  try {
    const lines = items
      .map((item) => {
        const qty = item.qty ?? item.quantity ?? 1;
        return `  ${qty}x ${item.name} — ${formatCurrency(item.price * qty)}`;
      })
      .join("\n");

    const grandTotal =
      Number(order.total) -
      Number(order.discount || 0) +
      Number(order.delivery_fee || 0) +
      Number(order.tip || 0);

    await getTransporter().sendMail({
      from: config.email.from,
      to,
      subject: `Your ${vendorName} order #${order.id} is confirmed`,
      text:
        `Thanks for your order from ${vendorName}!\n\n` +
        `Order #${order.id}\n\n${lines}\n\n` +
        `Total: ${formatCurrency(grandTotal)}\n\n` +
        `You can track its status live on your order page. Enjoy!`
    });

    return true;
  } catch (error) {
    console.error("Order confirmation email failed:", error.message);
    return false;
  }
}
