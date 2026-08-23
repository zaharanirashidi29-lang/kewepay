const axios = require("axios");
const crypto = require("crypto");
const BASE_URL = String(process.env.SNIPPE_API_BASE_URL || "https://api.snippe.sh").replace(
  /\/$/,
  ""
);
const { timingSafeEqualHex } = require("../middleware/security");

/** Single master Snippe key — merchants never see this. */
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

function formatError(err) {
  const data = err?.response?.data;
  if (!data) return err?.message || "Snippe request failed";
  return data.message || data.error || err.message || "Snippe request failed";
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
      metadata: { order_id: reference, gateway: "kewepay", ...metadata }
    },
    { headers: headers(reference), timeout: 45000 }
  );
  return data?.data || data;
}

async function sendPayout({
  amount,
  phone,
  reference,
  name = "Merchant",
  narration = "KewePay withdrawal"
}) {
  const payloads = [
    {
      amount: Number(amount),
      currency: "TZS",
      phone_number: normalizePhone(phone),
      recipient: { name, phone: normalizePhone(phone) },
      narration,
      metadata: { order_id: reference, gateway: "kewepay" }
    },
    {
      amount: Number(amount),
      currency: "TZS",
      channel: "mobile_money",
      phone_number: normalizePhone(phone),
      recipient_name: name,
      narration,
      metadata: { order_id: reference, gateway: "kewepay" }
    },
    {
      payout_type: "mobile",
      details: { amount: Number(amount), currency: "TZS" },
      phone_number: normalizePhone(phone),
      recipient: { name, phone: normalizePhone(phone) },
      narration,
      metadata: { order_id: reference, gateway: "kewepay" }
    }
  ];
  let lastErr;
  for (const body of payloads) {
    try {
      const { data } = await axios.post(`${BASE_URL}/v1/payouts/send`, body, {
        headers: headers(reference),
        timeout: 45000,
        validateStatus: () => true
      });
      if (data?.status === "success" || data?.data?.reference || data?.reference) {
        return data?.data || data;
      }
      lastErr = new Error(data?.message || JSON.stringify(data));
      if (data?.code === 400 || data?.error_code) continue;
      throw lastErr;
    } catch (e) {
      lastErr = e.response?.data
        ? new Error(e.response.data.message || JSON.stringify(e.response.data))
        : e;
    }
  }
  throw lastErr || new Error("Payout failed");
}

async function getPayment(reference) {
  const { data } = await axios.get(
    `${BASE_URL}/v1/payments/${encodeURIComponent(reference)}`,
    { headers: headers(), timeout: 30000 }
  );
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
  if (!secret) return false;
  if (!signature || !timestamp) return false;
  const eventTime = Number(timestamp);
  if (Number.isFinite(eventTime)) {
    const age = Math.floor(Date.now() / 1000) - eventTime;
    if (age > 300 || age < -60) return false;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return timingSafeEqualHex(signature, expected);
}

function mapStatus(status) {
  const v = String(status || "").toLowerCase();
  if (["completed", "success", "successful", "paid"].includes(v)) return "COMPLETED";
  if (
    ["failed", "fail", "declined", "cancelled", "canceled", "voided", "expired", "reversed"].includes(
      v
    )
  ) {
    return "FAILED";
  }
  return "PROCESSING";
}

module.exports = {
  createMobilePayment,
  sendPayout,
  getPayment,
  getBalance,
  verifyWebhookSignature,
  mapStatus,
  normalizePhone,
  formatError
};
