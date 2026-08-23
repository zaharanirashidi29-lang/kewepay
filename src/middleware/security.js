const crypto = require("crypto");

const buckets = new Map();

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return xf || req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimit({ windowMs = 60_000, max = 60, keyFn } = {}) {
  return (req, res, next) => {
    const key = (keyFn ? keyFn(req) : clientIp(req)) + ":" + req.path;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now - b.start > windowMs) {
      b = { start: now, count: 0 };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      return res.status(429).json({ success: false, error: "Too many requests" });
    }
    next();
  };
}

function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
}

function isSafePublicUrl(raw) {
  if (!raw) return false;
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "metadata.google.internal"
  ) {
    return false;
  }
  return true;
}

function timingSafeEqualHex(a, b) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

module.exports = {
  rateLimit,
  securityHeaders,
  isSafePublicUrl,
  timingSafeEqualHex,
  clientIp
};
