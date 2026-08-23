const express = require("express");
const ApiKey = require("../models/ApiKey");
const { requireSession, generateApiKey } = require("../middleware/auth");
const { rateLimit } = require("../middleware/security");

const router = express.Router();
const MAX_KEYS = Number(process.env.MAX_API_KEYS_PER_MERCHANT || 5);

router.get("/", requireSession, async (req, res) => {
  const keys = await ApiKey.find({ userId: req.user._id, revokedAt: null }).sort({ _id: -1 });
  res.json({
    success: true,
    keys: keys.map((k) => ({
      id: k._id,
      name: k.name,
      prefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt
    }))
  });
});

router.post(
  "/",
  requireSession,
  rateLimit({ windowMs: 60_000, max: 5, keyFn: (r) => String(r.user._id) }),
  async (req, res) => {
    const active = await ApiKey.countDocuments({
      userId: req.user._id,
      revokedAt: null
    });
    if (active >= MAX_KEYS) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_KEYS} active API keys. Revoke one first.`
      });
    }
    const { name } = req.body || {};
    const generated = generateApiKey();
    const key = await ApiKey.create({
      userId: req.user._id,
      name: String(name || "Default").slice(0, 64),
      keyPrefix: generated.prefix,
      keyHash: generated.hash
    });
    res.json({
      success: true,
      key: {
        id: key._id,
        name: key.name,
        prefix: key.keyPrefix,
        secret: generated.raw,
        warning: "Copy this key now. It will not be shown again. Never share it."
      }
    });
  }
);

router.delete("/:id", requireSession, async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, userId: req.user._id });
  if (!key) return res.status(404).json({ success: false, error: "Key not found" });
  key.revokedAt = new Date();
  await key.save();
  res.json({ success: true });
});

module.exports = router;
