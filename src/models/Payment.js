const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reference: { type: String, required: true, unique: true, index: true },
    snippeReference: { type: String, index: true },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "TZS" },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true
    },
    customerName: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    description: { type: String, default: "" },
    metadata: { type: Object, default: {} },
    merchantWebhookUrl: { type: String, default: "" },
    platformFeePercent: { type: Number, default: 0 },
    platformFeeAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    failureReason: { type: String, default: "" },
    snippeResponse: { type: Object, default: {} },
    walletCreditedAt: { type: Date, default: null },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
