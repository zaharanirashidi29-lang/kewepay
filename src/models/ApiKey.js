const mongoose = require("mongoose");

const apiKeySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "Default" },
    keyPrefix: { type: String, required: true },
    keyHash: { type: String, required: true },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApiKey", apiKeySchema);
