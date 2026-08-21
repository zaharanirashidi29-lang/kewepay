const axios = require("axios");
const crypto = require("crypto");

const BASE_URL = String(process.env.SNIPPE_API_BASE_URL || "https://api.snippe.sh").replace(
  /\/$/,
  ""
);

function getApiKey() {
  const key = process.env.SNIPPE_API_KEY;
  if (!key) throw new Error("SNIPPE_API_KEY is required");
  return key;
}

function headers(idempotencyKey) {
  const h = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${getApiKey()}`
  };
  if (idempotencyKey) h["Idempotency-Key"] = String(idempotencyKey);
  return h;
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return `255${digits.slice(1)}`;
  if (digits.length === 9) return `255${digits}`;
  return digits;
}

async function createMobilePayment({
  amount,
  phone,
  reference,
  webhookUrl,
  firstname = "Customer",
  lastname = "User",
  email = "customer@kewepay.local",
  metadata = {}
}) {
  const { data } = await axios.post(
    `${BASE_URL}/v1/payments`,
    {
      payment_type: "mobile",
      details: { amount: Number(amount), currency: "TZS" },
      phone_number: normalizePhone(phone),
      customer: { firstname, lastname, email },
      webhook_url: webhookUrl,
      metadata: { order_id: reference, ...metadata }
    },
    { headers: headers(reference), timeout: 45000 }
  );
  return data?.data || data;
}

async function getPayment(reference) {
  const { data } = await axios.get(`${BASE_URL}/v1/payments/${encodeURIComponent(reference)}`, {
    headers: headers(),
    timeout: 30000
  });
  return data?.data || data;
}

async function getBalance() {
  const { data } = await axios.get(`${BASE_URL}/v1/payments/balance`, {
    headers: headers(),
    timeout: 20000
  });
  return data?.data || data;
}

function verifyWebhookSignature({ rawBody, signature, timestamp, secret }) {
  if (!secret) return true;
  if (!signature || !timestamp) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(String(signature)), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

function mapStatus(status) {
  const v = String(status || "").toLowerCase();
  if (["completed", "success", "successful", "paid"].includes(v)) return "COMPLETED";
  if (["failed", "fail", "declined", "cancelled", "canceled", "voided", "expired"].includes(v)) {
    return "FAILED";
  }
  return "PROCESSING";
}

module.exports = {
  createMobilePayment,
  getPayment,
  getBalance,
  verifyWebhookSignature,
  mapStatus,
  normalizePhone
};
