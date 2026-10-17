const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signToken, requireSession } = require("../middleware/auth");
const { isSafePublicUrl } = require("../middleware/security");
const { normalizePhone } = require("../services/snippe");

const router = express.Router();

function isValidTzPhone(phone) {
  const normalized = normalizePhone(phone);
  return /^255[67]\d{8}$/.test(normalized);
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    businessName: user.businessName,
    webhookUrl: user.webhookUrl
  };
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, businessName } = req.body || {};
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        error: "name, email, phone, password required"
      });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }
    if (!isValidTzPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: "Enter a valid Tanzania phone number (e.g. 07XXXXXXXX)"
      });
    }

    const normalizedPhone = normalizePhone(phone);
    const emailLower = String(email).toLowerCase();

    const exists = await User.findOne({
      $or: [{ email: emailLower }, { phone: normalizedPhone }]
    });
    if (exists) {
      const conflict =
        exists.email === emailLower ? "Email already registered" : "Phone already registered";
      return res.status(409).json({ success: false, error: conflict });
    }

    const user = await User.create({
      name,
      email: emailLower,
      phone: normalizedPhone,
      passwordHash: await bcrypt.hash(password, 12),
      businessName: businessName || name,
      withdrawPhone: normalizedPhone,
      role: "merchant"
    });

    const token = signToken(user);
    res.json({
      success: true,
      token,
      user: publicUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password) {
      return res.status(400).json({ success: false, error: "phone and password required" });
    }
    if (!isValidTzPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: "Enter a valid Tanzania phone number (e.g. 07XXXXXXXX)"
      });
    }

    const user = await User.findOne({ phone: normalizePhone(phone) });
    if (!user) return res.status(401).json({ success: false, error: "Invalid credentials" });
    const ok = await bcrypt.compare(String(password || ""), user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid credentials" });
    if (user.status !== "active") {
      return res.status(403).json({ success: false, error: "Account suspended" });
    }
    res.json({
      success: true,
      token: signToken(user),
      user: publicUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/me", requireSession, async (req, res) => {
  res.json({
    success: true,
    user: publicUser(req.user)
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
    user: publicUser(req.user)
  });
});

module.exports = router;
