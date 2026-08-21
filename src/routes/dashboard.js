const express = require("express");
const Payment = require("../models/Payment");
const ApiKey = require("../models/ApiKey");
const { requireSession, requireAdmin } = require("../middleware/auth");
const snippe = require("../services/snippe");

const router = express.Router();

router.get("/summary", requireSession, async (req, res) => {
  const match =
    req.user.role === "admin" ? {} : { merchantId: req.user._id };
  const [total, completed, processing, failed, volume] = await Promise.all([
    Payment.countDocuments(match),
    Payment.countDocuments({ ...match, status: "COMPLETED" }),
    Payment.countDocuments({ ...match, status: "PROCESSING" }),
    Payment.countDocuments({ ...match, status: "FAILED" }),
    Payment.aggregate([
      { $match: { ...match, status: "COMPLETED" } },
      { $group: { _id: null, sum: { $sum: "$amount" }, fees: { $sum: "$platformFeeAmount" } } }
    ])
  ]);

  let snippeBalance = null;
  if (req.user.role === "admin") {
    try {
      const bal = await snippe.getBalance();
      snippeBalance = bal?.available?.value ?? bal?.balance?.value ?? null;
    } catch (_) {}
  }

  const keys = await ApiKey.countDocuments({
    userId: req.user._id,
    revokedAt: null
  });

  res.json({
    success: true,
    summary: {
      total,
      completed,
      processing,
      failed,
      volume: volume[0]?.sum || 0,
      fees: volume[0]?.fees || 0,
      api_keys: keys,
      snippe_balance: snippeBalance
    }
  });
});

router.get("/admin/overview", requireSession, requireAdmin, async (req, res) => {
  const User = require("../models/User");
  const merchants = await User.countDocuments({ role: "merchant" });
  const payments = await Payment.countDocuments();
  const completed = await Payment.countDocuments({ status: "COMPLETED" });
  let snippeBalance = null;
  try {
    const bal = await snippe.getBalance();
    snippeBalance = bal?.available?.value ?? bal?.balance?.value ?? null;
  } catch (err) {
    snippeBalance = { error: err.message };
  }
  res.json({
    success: true,
    overview: { merchants, payments, completed, snippe_balance: snippeBalance }
  });
});

module.exports = router;
