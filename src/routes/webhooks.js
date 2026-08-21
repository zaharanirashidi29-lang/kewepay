const express = require("express");
const Payment = require("../models/Payment");
const snippe = require("../services/snippe");
const { notifyMerchant } = require("../services/notify");

const router = express.Router();

async function handleSnippeWebhook(req, res) {
  try {
    const rawBody = req.body?.length ? req.body.toString("utf8") : "";
    const secret = process.env.SNIPPE_WEBHOOK_SECRET;
    if (secret) {
      const ok = snippe.verifyWebhookSignature({
        rawBody,
        signature: req.headers["x-webhook-signature"],
        timestamp: req.headers["x-webhook-timestamp"],
        secret
      });
      if (!ok) return res.status(401).json({ success: false, error: "Invalid signature" });
    }

    const body = rawBody ? JSON.parse(rawBody) : {};
    const event = String(req.headers["x-webhook-event"] || body.type || body.event || "").toLowerCase();
    const data = body.data || body;
    const snippeRef = data.reference || data.external_reference;
    const localRef = data.metadata?.order_id;

    const payment = await Payment.findOne({
      $or: [
        ...(localRef ? [{ reference: localRef }] : []),
        ...(snippeRef ? [{ snippeReference: snippeRef }] : [])
      ]
    });

    if (!payment) {
      console.warn("KewePay: unknown Snippe webhook", localRef || snippeRef);
      return res.status(200).json({ success: true, ignored: true });
    }

    let status = snippe.mapStatus(data.status);
    if (event === "payment.completed") status = "COMPLETED";
    if (["payment.failed", "payment.voided", "payment.expired"].includes(event)) {
      status = "FAILED";
    }

    if (payment.status !== "COMPLETED") {
      payment.status = status;
      payment.snippeResponse = data;
      if (status === "COMPLETED") {
        payment.completedAt = new Date();
        payment.failureReason = "";
      }
      if (status === "FAILED") {
        payment.failureReason = data.failure_reason || data.message || "Failed";
      }
      await payment.save();
      if (status === "COMPLETED" || status === "FAILED") {
        await notifyMerchant(payment);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("SNIPPE WEBHOOK ERROR", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

router.post("/snippe", express.raw({ type: "application/json" }), handleSnippeWebhook);

module.exports = router;
