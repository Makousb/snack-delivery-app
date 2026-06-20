import axios from "axios";
import { config, getMissingMpesaConfig } from "../config/env.js";

function getTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function getPassword(timestamp) {
  const { businessShortCode, password: passkey } = config.mpesa;
  return Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString("base64");
}

export const initiateSTKPush = async (phone, amount) => {
  const missing = getMissingMpesaConfig();

  if (missing.length) {
    throw new Error(`M-Pesa is not configured: missing ${missing.join(", ")}`);
  }

  const { stkPushUrl, accessToken, businessShortCode, callbackUrl } = config.mpesa;
  const timestamp = getTimestamp();

  const response = await axios.post(
    stkPushUrl,
    {
      BusinessShortCode: businessShortCode,
      Password: getPassword(timestamp),
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: businessShortCode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: "Order",
      TransactionDesc: "Food Payment"
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return response.data;
};
