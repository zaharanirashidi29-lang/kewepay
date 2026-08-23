const express = require("express");
const User = require("../models/User");
const Withdrawal = require("../models/Withdrawal");
const Payment = require("../models/Payment");
const { requireSession } = require("../middleware/auth");
const snippe = require("../services/snippe");
const { rateLimit } = require("../middleware/security");

const router = express.Router();
const MIN_WITHDRAW = Number(process.env.MIN_WITHDRAW_TZS || 100000);

function publicWebhook() {
  return (
    process.env.SNIPPE_WEBHOOK_URL ||
    `${String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "")}/webhooks/snippe`
  );
}

router.get("/balance", requireSession, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    success: true,
    balance: user.walletBalance || 0,
    currency: "TZS",
    min_withdraw: MIN_WITHDRAW,
    withdraw_phone: user.withdrawPhone || ""
  });
});

router.post(
  "/deposit",
  requireSession,
  rateLimit({ windowMs: 60_000, max: 20, keyFn: (r) => String(r.user._id) }),
  async (req, res) => {
    try {
      const { phone, amount, customer } = req.body || {};
      const amt = Number(amount);
      if (!phone || !amt) {
        return res.status(400).json({ success: false, error: "phone and amount required" });
      }
      if (amt < 500) {
        return res.status(400).json({ success: false, error: "Minimum deposit is 500 TZS" });
      }
      if (amt > 5_000_000) {
        return res.status(400).json({ success: false, error: "amount too large" });
      }

      const reference = `KPD${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
      const pct = Number(process.env.PLATFORM_FEE_PERCENT || 0);
      const fee = Math.round((amt * pct) / 100);
      const net = amt - fee;
      const webhookUrl = publicWebhook();
      if (!/^https:\/\//i.test(webhookUrl)) {
        return res.status(400).json({
          success: false,
          error: "HTTPS webhook required (set PUBLIC_BASE_URL or SNIPPE_WEBHOOK_URL)"
        });
      }
      const firstname = customer?.firstname || req.user.name?.split(" ")[0] || "Customer";
      const lastname =
        customer?.lastname || req.user.name?.split(" ").slice(1).join(" ") || "User";
      const push = await snippe.createMobilePayment({
        amount: amt,
        phone,
        reference,
        webhookUrl,
        firstname,
        lastname,
        email: req.user.email,
        metadata: { type: "deposit", merchant_id: String(req.user._id) }
      });
      const snippeRef = push?.reference;
      if (!snippeRef) {
        return res.status(502).json({ success: false, error: "Upstream payment provider error" });
      }

      const payment = await Payment.create({
        merchantId: req.user._id,
        reference,
        snippeReference: snippeRef,
        phone: snippe.normalizePhone(phone),
        amount: amt,
        status: "PROCESSING",
        customerName: `${firstname} ${lastname}`.trim(),
        customerEmail: req.user.email,
        description: "Wallet deposit",
        metadata: { type: "deposit" },
        merchantWebhookUrl: req.user.webhookUrl || "",
        platformFeePercent: pct,
        platformFeeAmount: fee,
        netAmount: net,
        snippeResponse: push
      });
      res.status(201).json({
        success: true,
        data: {
          reference: payment.reference,
          status: "pending",
          amount: amt
        }
      });
    } catch (err) {
      res
        .status(err.response?.status || 500)
        .json({ success: false, error: snippe.formatError(err) });
    }
  }
);

router.post(
  "/withdraw",
  requireSession,
  rateLimit({ windowMs: 60_000, max: 10, keyFn: (r) => String(r.user._id) }),
  async (req, res) => {
    try {
      const { phone, amount, recipientName } = req.body || {};
      const amt = Number(amount);
      if (!phone || !amt) {
        return res.status(400).json({ success: false, error: "phone and amount required" });
      }
      if (amt < MIN_WITHDRAW) {
        return res.status(400).json({
          success: false,
          error: `Minimum withdrawal is ${MIN_WITHDRAW.toLocaleString()} TZS`
        });
      }
      const user = await User.findById(req.user._id);
      const fee = 0;
      const total = amt + fee;
      if ((user.walletBalance || 0) < total) {
        return res.status(400).json({ success: false, error: "Insufficient wallet balance" });
      }

      const reference = `KPW${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
      const debited = await User.findOneAndUpdate(
        { _id: user._id, walletBalance: { $gte: total } },
        {
          $inc: { walletBalance: -total },
          $set: { withdrawPhone: snippe.normalizePhone(phone) }
        },
        { new: true }
      );
      if (!debited) {
        return res.status(400).json({ success: false, error: "Insufficient wallet balance" });
      }

      let payout;
      try {
        payout = await snippe.sendPayout({
          amount: amt,
          phone,
          reference,
          name: recipientName || user.businessName || user.name,
          narration: `KewePay withdraw ${reference}`
        });
      } catch (err) {
        await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: total } });
        return res.status(502).json({ success: false, error: err.message || "Payout failed" });
      }

      const snippeRef = payout?.reference || payout?.id || null;
      const status = snippe.mapStatus(payout?.status);
      const w = await Withdrawal.create({
        merchantId: user._id,
        reference,
        snippeReference: snippeRef,
        phone: snippe.normalizePhone(phone),
        amount: amt,
        fee,
        totalDebit: total,
        status:
          status === "COMPLETED" ? "COMPLETED" : status === "FAILED" ? "FAILED" : "PROCESSING",
        recipientName: recipientName || user.businessName || user.name,
        snippeResponse: payout,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
        failureReason: status === "FAILED" ? payout?.failure_reason || "Failed" : ""
      });
      if (w.status === "FAILED") {
        await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: total } });
      }
      const fresh = await User.findById(user._id);
      res.status(201).json({
        success: true,
        data: {
          reference: w.reference,
          status: w.status.toLowerCase(),
          amount: w.amount,
          phone: w.phone,
          wallet_balance: fresh.walletBalance
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.get("/withdrawals", requireSession, async (req, res) => {
  const rows = await Withdrawal.find({ merchantId: req.user._id })
    .sort({ _id: -1 })
    .limit(50)
    .select("-snippeResponse");
  res.json({ success: true, withdrawals: rows });
});

module.exports = router;
