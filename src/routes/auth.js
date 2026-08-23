const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signToken, requireSession } = require("../middleware/auth");
const { isSafePublicUrl } = require("../middleware/security");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, businessName } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "name, email, password required" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }
    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(409).json({ success: false, error: "Email already registered" });

    const user = await User.create({
      name,
      email: String(email).toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      businessName: businessName || name,
      role: "merchant"
    });

    const token = signToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessName: user.businessName
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: String(email || "").toLowerCase() });
    if (!user) return res.status(401).json({ success: false, error: "Invalid credentials" });
    const ok = await bcrypt.compare(String(password || ""), user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid credentials" });
    if (user.status !== "active") {
      return res.status(403).json({ success: false, error: "Account suspended" });
    }
    res.json({
      success: true,
      token: signToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessName: user.businessName,
        webhookUrl: user.webhookUrl
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/me", requireSession, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      businessName: req.user.businessName,
      webhookUrl: req.user.webhookUrl
    }
  });
});

router.patch("/me", requireSession, async (req, res) => {
  const { businessName, webhookUrl, name } = req.body || {};
  if (businessName != null) req.user.businessName = String(businessName).slice(0, 120);
  if (name != null) req.user.name = String(name).slice(0, 120);
  if (webhookUrl != null) {
    const url = String(webhookUrl).trim();
    if (url && !isSafePublicUrl(url)) {
      return res.status(400).json({
        success: false,
        error: "webhookUrl must be a public HTTPS URL (no localhost/private IPs)"
      });
    }
    req.user.webhookUrl = url;
  }
  await req.user.save();
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      businessName: req.user.businessName,
      webhookUrl: req.user.webhookUrl
    }
  });
});

module.exports = router;
