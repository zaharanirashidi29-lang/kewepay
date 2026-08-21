const express = require("express");
const ApiKey = require("../models/ApiKey");
const { requireSession, generateApiKey } = require("../middleware/auth");

const router = express.Router();

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

router.post("/", requireSession, async (req, res) => {
  const { name } = req.body || {};
  const generated = generateApiKey();
  const key = await ApiKey.create({
    userId: req.user._id,
    name: name || "Default",
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
      warning: "Copy this key now. It will not be shown again."
    }
  });
});

router.delete("/:id", requireSession, async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.id, userId: req.user._id });
  if (!key) return res.status(404).json({ success: false, error: "Key not found" });
  key.revokedAt = new Date();
  await key.save();
  res.json({ success: true });
});

module.exports = router;
