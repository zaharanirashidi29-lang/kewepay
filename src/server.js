require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const authRoutes = require("./routes/auth");
const keyRoutes = require("./routes/keys");
const paymentRoutes = require("./routes/payments");
const dashboardRoutes = require("./routes/dashboard");
const webhookRoutes = require("./routes/webhooks");
const walletRoutes = require("./routes/wallet");
const snippe = require("./services/snippe");
const { startSyncLoop, syncOpenPayments } = require("./services/sync");
const { securityHeaders, rateLimit } = require("./middleware/security");
const { requireSession, requireAdmin } = require("./middleware/auth");

const app = express();
const PORT = Number(process.env.PORT || 4100);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(securityHeaders);

const corsOrigin = process.env.CORS_ORIGIN || true;
app.use(
  cors({
    origin:
      corsOrigin === true || corsOrigin === "true" || corsOrigin === "*"
        ? true
        : String(corsOrigin)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key"]
  })
);

// Raw body ONLY for Snippe webhooks (signature verify)
app.use("/webhooks", webhookRoutes);

app.use(express.json({ limit: "200kb" }));
app.use(rateLimit({ windowMs: 60_000, max: 200 }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", async (_req, res) => {
  const checks = {
    service: "KewePay",
    mode: "sub-gateway",
    routing: "Merchant API keys → KewePay → single Snippe API",
    snippe_configured: Boolean(process.env.SNIPPE_API_KEY),
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
  };
  try {
    await snippe.getBalance();
    checks.snippe_api = "Authenticated";
  } catch (err) {
    checks.snippe_api = "Error";
    checks.snippe_error = err.response?.data?.message || err.message;
  }
  res.json(checks);
});

app.post("/admin/sync", requireSession, requireAdmin, async (_req, res) => {
  const result = await syncOpenPayments({ limit: 50 });
  res.json({ success: true, ...result });
});

app.use("/auth", rateLimit({ windowMs: 60_000, max: 40 }), authRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/keys", keyRoutes);
app.use("/v1/payments", paymentRoutes);
app.use("/payments", paymentRoutes);
app.use("/wallet", walletRoutes);

app.get("/{*path}", (req, res, next) => {
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/v1") ||
    req.path.startsWith("/auth") ||
    req.path.startsWith("/webhooks")
  ) {
    return next();
  }
  if (req.path.includes(".")) return next();
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

async function ensureAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "admin@kewepay.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.ADMIN_NAME || "KewePay Admin";
  let admin = await User.findOne({ email });
  if (!admin) {
    admin = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin",
      businessName: "KewePay Platform"
    });
    console.log("Bootstrap admin created:", email);
  }
}

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error("JWT_SECRET must be a long random string");
  }
  if (!process.env.SNIPPE_API_KEY) {
    throw new Error("SNIPPE_API_KEY is required (single master key)");
  }
  if (!process.env.API_KEY_PEPPER) {
    // Stable fallback (prefer setting API_KEY_PEPPER in .env for production)
    process.env.API_KEY_PEPPER = process.env.JWT_SECRET;
  }
  // Local/dev: allow unsigned Snippe webhooks unless explicitly required.
  // Production: set REQUIRE_SNIPPE_WEBHOOK_SIG=true and SNIPPE_WEBHOOK_SECRET in Snippe + .env
  if (process.env.REQUIRE_SNIPPE_WEBHOOK_SIG == null) {
    process.env.REQUIRE_SNIPPE_WEBHOOK_SIG = "false";
  }
  if (!process.env.SNIPPE_SYNC_INTERVAL_MS) {
    process.env.SNIPPE_SYNC_INTERVAL_MS = "15000";
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);
  console.log("MongoDB connected (kewepay)");
  await ensureAdmin();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`KewePay sub-gateway on http://0.0.0.0:${PORT}`);
    console.log("Merchants use kp_live_* keys; all rails go through one Snippe API key.");
    startSyncLoop();
  });
}

start().catch((err) => {
  console.error("Failed to start KewePay:", err.message);
  process.exit(1);
});
