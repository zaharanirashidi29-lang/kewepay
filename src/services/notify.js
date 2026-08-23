const axios = require("axios");
const crypto = require("crypto");
const { isSafePublicUrl } = require("../middleware/security");

function signPayload(body, secret) {
  if (!secret) return null;
  const ts = String(Math.floor(Date.now() / 1000));
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return { ts, sig, raw };
}

async function notifyMerchant(payment) {
  const url = payment.merchantWebhookUrl;
  if (!url) return { skipped: true };
  if (!isSafePublicUrl(url)) {
    console.error("Blocked unsafe merchant webhook URL", payment.reference);
    return { ok: false, error: "Unsafe webhook URL" };
  }

  const payload = {
    event:
      payment.status === "COMPLETED"
        ? "payment.completed"
        : payment.status === "FAILED"
          ? "payment.failed"
          : "payment.updated",
    data: {
      reference: payment.reference,
      status: payment.status.toLowerCase(),
      amount: payment.amount,
      currency: payment.currency || "TZS",
      phone: payment.phone,
      metadata: payment.metadata || {},
      platform_fee: payment.platformFeeAmount,
      net_amount: payment.netAmount,
      failure_reason: payment.failureReason || undefined,
      completed_at: payment.completedAt || undefined
    }
  };

  const secret = process.env.MERCHANT_WEBHOOK_SECRET || "";
  const signed = signPayload(payload, secret);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "KewePay-Webhook/1.0",
    "X-KewePay-Event": payload.event
  };
  if (signed) {
    headers["X-KewePay-Timestamp"] = signed.ts;
    headers["X-KewePay-Signature"] = signed.sig;
  }

  try {
    await axios.post(url, signed ? signed.raw : payload, {
      timeout: 10000,
      headers,
      maxRedirects: 0,
      validateStatus: () => true
    });
    return { ok: true };
  } catch (err) {
    console.error("Merchant webhook failed", payment.reference, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { notifyMerchant };
