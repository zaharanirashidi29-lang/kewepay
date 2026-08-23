const express = require("express");
const Payment = require("../models/Payment");
const { requireApiKey, requireSession } = require("../middleware/auth");
const snippe = require("../services/snippe");
const { applyPaymentFromSnippe } = require("../services/sync");
const { rateLimit, isSafePublicUrl } = require("../middleware/security");

const router = express.Router();

function publicBase() {
  return String(process.env.PUBLIC_BASE_URL || "http://localhost:4100").replace(/\/$/, "");
}

function feeFor(amount) {
  const pct = Number(process.env.PLATFORM_FEE_PERCENT || 1);
  const fee = Math.round((Number(amount) * pct) / 100);
  return { pct, fee, net: Number(amount) - fee };
}

function merchantPaymentView(payment) {
  return {
    reference: payment.reference,
    status: String(payment.status || "").toLowerCase(),
    amount: payment.amount,
    currency: payment.currency || "TZS",
    phone: payment.phone,
    metadata: payment.metadata || {},
    platform_fee: payment.platformFeeAmount,
    net_amount: payment.netAmount,
    failure_reason: payment.failureReason || undefined,
    created_at: payment.createdAt,
    completed_at: payment.completedAt
  };
}

const createLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyFn: (req) => String(req.user?._id || "anon")
});

router.post("/", requireApiKey, createLimiter, async (req, res) => {
  try {
    const { phone, amount, reference, customer, description, metadata, webhook_url } =
      req.body || {};
    if (!phone || !amount) {
      return res.status(400).json({ success: false, error: "phone and amount required" });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 500) {
      return res.status(400).json({ success: false, error: "amount must be at least 500 TZS" });
    }
    if (amt > 5_000_000) {
      return res.status(400).json({ success: false, error: "amount too large" });
    }
    if (webhook_url && !isSafePublicUrl(webhook_url)) {
      return res
        .status(400)
        .json({ success: false, error: "webhook_url must be a public HTTPS URL" });
    }

    const localRef =
      reference || `KP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(localRef))) {
      return res.status(400).json({ success: false, error: "invalid reference format" });
    }
    const exists = await Payment.findOne({ reference: localRef });
    if (exists) {
      return res.status(409).json({ success: false, error: "reference already used" });
    }

    const fees = feeFor(amt);
    const firstname = customer?.firstname || customer?.first_name || "Customer";
    const lastname = customer?.lastname || customer?.last_name || "User";
    const email = customer?.email || "customer@kewepay.local";

    // Always KewePay → Snippe master webhook (merchants do not set Snippe webhooks)
    const webhookUrl =
      process.env.SNIPPE_WEBHOOK_URL || `${publicBase()}/webhooks/snippe`;
    if (!/^https:\/\//i.test(webhookUrl)) {
      return res.status(400).json({
        success: false,
        error: "PUBLIC_BASE_URL or SNIPPE_WEBHOOK_URL must be HTTPS (required by Snippe)"
      });
    }

    const push = await snippe.createMobilePayment({
      amount: amt,
      phone,
      reference: localRef,
      webhookUrl,
      firstname,
      lastname,
      email,
      metadata: { ...(metadata || {}), merchant_id: String(req.user._id) }
    });

    const snippeRef = push?.reference;
    if (!snippeRef) {
      return res.status(502).json({ success: false, error: "Upstream payment provider error" });
    }

    const payment = await Payment.create({
      merchantId: req.user._id,
      reference: localRef,
      snippeReference: snippeRef,
      phone: snippe.normalizePhone(phone),
      amount: amt,
      status: "PROCESSING",
      customerName: `${firstname} ${lastname}`.trim(),
      customerEmail: email,
      description: description || "",
      metadata: metadata || {},
      merchantWebhookUrl: webhook_url || req.user.webhookUrl || "",
      platformFeePercent: fees.pct,
      platformFeeAmount: fees.fee,
      netAmount: fees.net,
      snippeResponse: push
    });

    res.status(201).json({ success: true, data: merchantPaymentView(payment) });
  } catch (err) {
    const msg = snippe.formatError(err);
    res.status(err.response?.status || 500).json({ success: false, error: msg });
  }
});

router.get("/:reference", requireApiKey, async (req, res) => {
  const payment = await Payment.findOne({
    reference: req.params.reference,
    merchantId: req.user._id
  });
  if (!payment) return res.status(404).json({ success: false, error: "Not found" });

  if (["PENDING", "PROCESSING"].includes(payment.status) && payment.snippeReference) {
    try {
      const live = await snippe.getPayment(payment.snippeReference);
      await applyPaymentFromSnippe(payment, live, "QUERY");
      await payment.reload?.();
      const fresh = await Payment.findById(payment._id);
      return res.json({ success: true, data: merchantPaymentView(fresh || payment) });
    } catch (_) {
      /* keep local */
    }
  }

  res.json({ success: true, data: merchantPaymentView(payment) });
});

router.get("/", requireSession, async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { merchantId: req.user._id };
  if (req.query.status) filter.status = String(req.query.status).toUpperCase();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const rows = await Payment.find(filter)
    .sort({ _id: -1 })
    .limit(limit)
    .select("-snippeResponse");
  res.json({
    success: true,
    payments: rows.map((p) => ({
      ...merchantPaymentView(p),
      id: p._id,
      customerName: p.customerName
    }))
  });
});

module.exports = router;
