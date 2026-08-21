const axios = require("axios");

async function notifyMerchant(payment) {
  const url = payment.merchantWebhookUrl;
  if (!url) return { skipped: true };

  const payload = {
    event:
      payment.status === "COMPLETED"
        ? "payment.completed"
        : payment.status === "FAILED"
          ? "payment.failed"
          : "payment.updated",
    data: {
      reference: payment.reference,
      snippe_reference: payment.snippeReference,
      status: payment.status.toLowerCase(),
      amount: payment.amount,
      currency: payment.currency,
      phone: payment.phone,
      metadata: payment.metadata,
      platform_fee: payment.platformFeeAmount,
      net_amount: payment.netAmount,
      failure_reason: payment.failureReason || undefined,
      completed_at: payment.completedAt || undefined
    }
  };

  try {
    await axios.post(url, payload, {
      timeout: 10000,
      headers: { "Content-Type": "application/json", "User-Agent": "KewePay-Webhook/1.0" },
      validateStatus: () => true
    });
    return { ok: true };
  } catch (err) {
    console.error("Merchant webhook failed", payment.reference, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { notifyMerchant };
