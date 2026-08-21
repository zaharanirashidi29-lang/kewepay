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
const snippe = require("./services/snippe");

const app = express();
const PORT = Number(process.env.PORT || 4100);

app.use(cors());
app.use("/webhooks", webhookRoutes);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", async (_req, res) => {
  const checks = {
    service: "KewePay",
    routing: "All collections → Snippe",
    snippe_api_key: process.env.SNIPPE_API_KEY ? "Set" : "Missing",
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
  };
  try {
    const bal = await snippe.getBalance();
    checks.snippe_api = "Authenticated";
    checks.snippe_balance = bal?.available?.value ?? bal?.balance?.value ?? null;
  } catch (err) {
    checks.snippe_api = err.response?.data?.message || err.message;
  }
  res.json(checks);
});

app.use("/auth", authRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/keys", keyRoutes);
app.use("/v1/payments", paymentRoutes);
app.use("/payments", paymentRoutes);

app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/v1") || req.path.startsWith("/auth")) {
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
      passwordHash: await bcrypt.hash(password, 10),
      role: "admin",
      businessName: "KewePay Platform"
    });
    console.log("Bootstrap admin created:", email);
  }
}

async function start() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);
  console.log("MongoDB connected (kewepay)");
  await ensureAdmin();
  app.listen(PORT, () => {
    console.log(`KewePay running on http://localhost:${PORT}`);
    console.log("UnlockVIP backend is NOT modified — this is a separate gateway.");
  });
}

start().catch((err) => {
  console.error("Failed to start KewePay:", err.message);
  process.exit(1);
});
