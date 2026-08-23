const express = require("express");
const Payment = require("../models/Payment");
const Withdrawal = require("../models/Withdrawal");
const snippe = require("../services/snippe");
const {
  applyPaymentFromSnippe,
  applyWithdrawalFromSnippe
} = require("../services/sync");

const router = express.Router();

/**
 * Single Snippe → KewePay webhook intake.
 * Merchants never talk to Snippe; we fan-out via notifyMerchant after status apply.
 */
async function handleSnippeWebhook(req, res) {
  try {
    const rawBody = req.body?.length ? req.body.toString("utf8") : "";
    const secret = process.env.SNIPPE_WEBHOOK_SECRET;
    const requireSig = String(process.env.REQUIRE_SNIPPE_WEBHOOK_SIG || "true") !== "false";

    if (requireSig) {
      if (!secret) {
        console.error("SNIPPE_WEBHOOK_SECRET missing — rejecting webhook");
        return res.status(503).json({ success: false, error: "Webhook secret not configured" });
      }
      const ok = snippe.verifyWebhookSignature({
        rawBody,
        signature: req.headers["x-webhook-signature"] || req.headers["x-snippe-signature"],
        timestamp: req.headers["x-webhook-timestamp"] || req.headers["x-snippe-timestamp"],
        secret
      });
      if (!ok) return res.status(401).json({ success: false, error: "Invalid signature" });
    }

    const body = rawBody ? JSON.parse(rawBody) : {};
    const event = String(
      req.headers["x-webhook-event"] || body.type || body.event || ""
    ).toLowerCase();
    const data = body.data || body;
    const snippeRef = data.reference || data.external_reference;
    const localRef = data.metadata?.order_id;

    if (event.startsWith("payout.") || data.object === "payout") {
      const w = await Withdrawal.findOne({
        $or: [
          ...(localRef ? [{ reference: localRef }] : []),
          ...(snippeRef ? [{ snippeReference: snippeRef }] : [])
        ]
      });
      if (!w) return res.status(200).json({ success: true, ignored: true });
      let status = snippe.mapStatus(data.status);
      if (event === "payout.completed") status = "COMPLETED";
      if (event === "payout.failed" || event === "payout.reversed") status = "FAILED";
      await applyWithdrawalFromSnippe(w, { ...data, status: status.toLowerCase() });
      return res.status(200).json({ success: true });
    }

    const payment = await Payment.findOne({
      $or: [
        ...(localRef ? [{ reference: localRef }] : []),
        ...(snippeRef ? [{ snippeReference: snippeRef }] : [])
      ]
    });
    if (!payment) return res.status(200).json({ success: true, ignored: true });

    let status = snippe.mapStatus(data.status);
    if (event === "payment.completed") status = "COMPLETED";
    if (["payment.failed", "payment.voided", "payment.expired"].includes(event)) {
      status = "FAILED";
    }

    await applyPaymentFromSnippe(
      payment,
      { ...data, status: status.toLowerCase(), reference: snippeRef || data.reference },
      "WEBHOOK"
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("SNIPPE WEBHOOK ERROR", err.message);
    return res.status(500).json({ success: false, error: "Webhook processing failed" });
  }
}

router.post("/snippe", express.raw({ type: "application/json" }), handleSnippeWebhook);
module.exports = router;
