const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["merchant", "admin"], default: "merchant" },
    businessName: { type: String, default: "" },
    webhookUrl: { type: String, default: "" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    walletBalance: { type: Number, default: 0 },
    withdrawPhone: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
