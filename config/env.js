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
