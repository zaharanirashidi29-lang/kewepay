const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const ApiKey = require("../models/ApiKey");

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email },
    process.env.JWT_SECRET || "dev",
    { expiresIn: "7d" }
  );
}

async function requireSession(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: "Login required" });
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev");
    const user = await User.findById(payload.sub);
    if (!user || user.status !== "active") {
      return res.status(401).json({ success: false, error: "Invalid session" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid session" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admin only" });
  }
  next();
}

function hashApiKey(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateApiKey() {
  const raw = `kp_live_${crypto.randomBytes(24).toString("hex")}`;
  return {
    raw,
    prefix: raw.slice(0, 16),
    hash: hashApiKey(raw)
  };
}

async function requireApiKey(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const raw = header.startsWith("Bearer ")
      ? header.slice(7)
      : req.headers["x-api-key"] || "";
    if (!raw || !raw.startsWith("kp_")) {
      return res.status(401).json({ success: false, error: "API key required" });
    }
    const key = await ApiKey.findOne({ keyHash: hashApiKey(raw), revokedAt: null });
    if (!key) return res.status(401).json({ success: false, error: "Invalid API key" });
    const user = await User.findById(key.userId);
    if (!user || user.status !== "active") {
      return res.status(401).json({ success: false, error: "Merchant inactive" });
    }
    key.lastUsedAt = new Date();
    await key.save();
    req.user = user;
    req.apiKey = key;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid API key" });
  }
}

module.exports = {
  signToken,
  requireSession,
  requireAdmin,
  requireApiKey,
  generateApiKey,
  hashApiKey
};
