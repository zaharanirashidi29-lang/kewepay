const Payment = require("../models/Payment");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");
const snippe = require("./snippe");
const { notifyMerchant } = require("./notify");

/**
 * Apply Snippe payment status onto a local Payment row.
 * Credits wallet at most once (walletCreditedAt).
 */
async function applyPaymentFromSnippe(payment, live, source = "SYNC") {
  if (!payment || !live) return payment;
  if (payment.status === "COMPLETED" && payment.walletCreditedAt) {
    payment.snippeResponse = live;
    return payment;
  }

  const mapped = snippe.mapStatus(live.status);
  const prev = payment.status;
  payment.snippeResponse = live;
  if (live.reference && !payment.snippeReference) {
    payment.snippeReference = live.reference;
  }

  if (mapped === "COMPLETED" && prev !== "COMPLETED") {
    payment.status = "COMPLETED";
    payment.completedAt = new Date();
    payment.failureReason = "";
    if (!payment.walletCreditedAt) {
      const credit = Number(payment.netAmount || payment.amount || 0);
      await User.findByIdAndUpdate(payment.merchantId, {
        $inc: { walletBalance: credit }
      });
      payment.walletCreditedAt = new Date();
    }
    await payment.save();
    await notifyMerchant(payment).catch(() => {});
    return payment;
  }

  if (mapped === "FAILED" && prev !== "COMPLETED") {
    payment.status = "FAILED";
    payment.failureReason =
      live.failure_reason || live.failure_message || live.message || "Failed";
    await payment.save();
    if (prev !== "FAILED") await notifyMerchant(payment).catch(() => {});
    return payment;
  }

  if (mapped === "PROCESSING" && prev === "PENDING") {
    payment.status = "PROCESSING";
  }
  await payment.save();
  return payment;
}

async function applyWithdrawalFromSnippe(w, live) {
  if (!w || !live) return w;
  if (w.status === "COMPLETED") {
    w.snippeResponse = live;
    await w.save();
    return w;
  }
  const mapped = snippe.mapStatus(live.status);
  const prev = w.status;
  w.snippeResponse = live;
  if (mapped === "COMPLETED") {
    w.status = "COMPLETED";
    w.completedAt = new Date();
    w.failureReason = "";
  } else if (mapped === "FAILED") {
    w.status = "FAILED";
    w.failureReason = live.failure_reason || live.message || "Failed";
    if (prev !== "FAILED") {
      await User.findByIdAndUpdate(w.merchantId, {
        $inc: { walletBalance: w.totalDebit }
      });
    }
  }
  await w.save();
  return w;
}

async function syncOpenPayments({ limit = 25 } = {}) {
  const open = await Payment.find({
    status: { $in: ["PENDING", "PROCESSING"] },
    snippeReference: { $exists: true, $ne: "" }
  })
    .sort({ updatedAt: 1 })
    .limit(limit);

  let updated = 0;
  for (const payment of open) {
    try {
      const live = await snippe.getPayment(payment.snippeReference);
      const before = payment.status;
      await applyPaymentFromSnippe(payment, live, "SYNC");
      if (payment.status !== before) updated += 1;
    } catch (err) {
      console.error("sync payment", payment.reference, err.message);
    }
  }
  return { checked: open.length, updated };
}

function startSyncLoop() {
  const ms = Number(process.env.SNIPPE_SYNC_INTERVAL_MS || 20000);
  if (!Number.isFinite(ms) || ms < 5000) return;
  console.log(`Snippe sync loop every ${ms}ms (sub-gateway status pull)`);
  const tick = async () => {
    try {
      await syncOpenPayments();
    } catch (err) {
      console.error("sync loop", err.message);
    }
  };
  setTimeout(tick, 3000);
  setInterval(tick, ms);
}

module.exports = {
  applyPaymentFromSnippe,
  applyWithdrawalFromSnippe,
  syncOpenPayments,
  startSyncLoop
};
