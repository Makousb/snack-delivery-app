import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";

function getOptionalNumber(name, fallback) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (isProduction) {
    throw new Error("SESSION_SECRET is required in production.");
  }

  return "development-session-secret-change-me";
}

export const config = {
  env: process.env.NODE_ENV || "development",
  isProduction,
  port: getOptionalNumber("PORT", 3000),
  sessionSecret: getSessionSecret(),
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  database: {
    host: process.env.DB_HOST,
    port: getOptionalNumber("DB_PORT", undefined),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true"
  },
  // Online payments are opt-in. For a cash-only beta, leave MPESA_ENABLED
  // unset/false: the M-Pesa checkout button is hidden, M-Pesa orders are
  // rejected, and the (currently unauthenticated) Daraja callback is inert.
  payments: {
    mpesaEnabled: process.env.MPESA_ENABLED === "true"
  },
  // SMS order updates are opt-in (Africa's Talking). Without credentials the
  // app runs exactly as before — no texts are sent.
  sms: {
    enabled: process.env.SMS_ENABLED === "true",
    username: process.env.AT_USERNAME || "",
    apiKey: process.env.AT_API_KEY || "",
    from: process.env.SMS_FROM || "",
    endpoint:
      process.env.AT_SMS_URL ||
      "https://api.africastalking.com/version1/messaging"
  },
  // Transactional email is opt-in. Without SMTP credentials the app runs
  // exactly as before — order confirmations simply aren't sent.
  email: {
    enabled: process.env.EMAIL_ENABLED === "true",
    host: process.env.SMTP_HOST || "",
    port: getOptionalNumber("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "Snack <no-reply@snack.local>"
  },
  mpesa: {
    stkPushUrl:
      process.env.MPESA_STK_PUSH_URL ||
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    accessToken: process.env.MPESA_ACCESS_TOKEN || "",
    businessShortCode: process.env.MPESA_BUSINESS_SHORT_CODE || "174379",
    password: process.env.MPESA_PASSWORD || "",
    callbackUrl: process.env.MPESA_CALLBACK_URL || ""
  }
};

export function isEmailConfigured() {
  return (
    config.email.enabled &&
    Boolean(config.email.host && config.email.user && config.email.pass)
  );
}

export function getMissingMpesaConfig() {
  const requiredValues = {
    MPESA_ACCESS_TOKEN: config.mpesa.accessToken,
    MPESA_PASSWORD: config.mpesa.password,
    MPESA_CALLBACK_URL: config.mpesa.callbackUrl
  };

  return Object.entries(requiredValues)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}
