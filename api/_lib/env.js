import fs from "node:fs";
import path from "node:path";

export function config() {
  const env = process.env;
  let privateKey = env.YOTI_PRIVATE_KEY || "";
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n").trim();
  if (!privateKey) {
    const keyPath = path.join(process.cwd(), "privateKey.pem");
    if (fs.existsSync(keyPath)) {
      privateKey = fs.readFileSync(keyPath, "utf8").trim();
    }
  }
  return {
    yoti: {
      sdkId: env.YOTI_SDK_ID || "",
      privateKey,
      baseUrl: (env.YOTI_BASE_URL || "https://api.yoti.com/sandbox/idverify/v1").replace(/\/+$/, ""),
      redirectTemplate:
        env.YOTI_REDIRECT_TEMPLATE ||
        "https://yoti.com/id-verification/iframes/{sdkId}?sessionToken={token}",
      sessionTtlMinutes: parseInt(env.SESSION_TTL_MINUTES || "15", 10),
    },
    kv: {
      restUrl: (env.KV_REST_URL || "").replace(/\/+$/, ""),
      restToken: env.KV_REST_TOKEN || "",
    },
    ghost: {
      url: (env.GHOST_URL || "").replace(/\/+$/, ""),
      adminKey: env.GHOST_ADMIN_KEY || "",
      newsletterId: env.GHOST_NEWSLETTER_ID || "",
      compedExpiryField: env.GHOST_COMPED_EXPIRY_FIELD || "comped_expiry",
      sendMagicLink: (env.SEND_MAGIC_LINK || "true") !== "false",
    },
    make: {
      webhookUrl: env.MAKE_WEBHOOK_URL || "",
    },
    allowedOrigins: env.ALLOWED_ORIGINS || "*",
    ageMin: parseInt(env.AGE_MIN || "16", 10),
    ageMax: parseInt(env.AGE_MAX || "25", 10),
    membershipMonths: parseInt(env.MEMBERSHIP_MONTHS || "12", 10),
    programmeLabel: env.PROGRAMME_LABEL || "Postcode Lottery",
    verifiedLabel: env.VERIFIED_LABEL || "Verified 16-25",
    pendingTtlSeconds: 86400,
    maxSessionsPerEmailPerDay: 3,
    maxSessionsPerIpPerDay: 20,
  };
}

export function missingConfig(cfg) {
  const missing = [];
  if (!cfg.yoti.sdkId) missing.push("YOTI_SDK_ID");
  if (!cfg.yoti.privateKey) missing.push("YOTI_PRIVATE_KEY");
  if (!cfg.ghost.url) missing.push("GHOST_URL");
  if (!cfg.ghost.adminKey) missing.push("GHOST_ADMIN_KEY");
  return missing;
}
