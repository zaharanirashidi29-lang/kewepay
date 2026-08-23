const mongoose = require("mongoose");
const withdrawalSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reference: { type: String, required: true, unique: true },
  snippeReference: { type: String, index: true },
  phone: { type: String, required: true },
  amount: { type: Number, required: true },
  fee: { type: Number, default: 0 },
  totalDebit: { type: Number, required: true },
  status: { type: String, enum: ["PENDING","PROCESSING","COMPLETED","FAILED"], default: "PROCESSING", index: true },
  recipientName: { type: String, default: "" },
  failureReason: { type: String, default: "" },
  snippeResponse: { type: Object, default: {} },
  completedAt: { type: Date }
}, { timestamps: true });
module.exports = mongoose.model("Withdrawal", withdrawalSchema);
