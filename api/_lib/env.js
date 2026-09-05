export function config() {
  const env = process.env;
  return {
    veriff: {
      apiUrl: (env.VERIFF_API_URL || "https://stationapi.veriff.com").replace(/\/+$/, ""),
      apiKey: env.VERIFF_API_KEY || "",
      sharedSecret: env.VERIFF_SHARED_SECRET || "",
      appBaseUrl: (env.APP_BASE_URL || "").replace(/\/+$/, ""),
    },
    kv: {
      restUrl: (env.KV_REST_URL || "").replace(/\/+$/, ""),
      restToken: env.KV_REST_TOKEN || "",
    },
    ghost: {
      url: (env.GHOST_URL || env.GHOST_API_URL || "").replace(/\/+$/, ""),
      adminKey: env.GHOST_ADMIN_API_KEY || env.GHOST_ADMIN_KEY || "",
      newsletterId: env.GHOST_NEWSLETTER_ID || "",
      sendMagicLink: (env.SEND_MAGIC_LINK || "true") !== "false",
    },
    email: {
      from: env.EMAIL_FROM || "",
      providerKey: env.EMAIL_PROVIDER_API_KEY || "",
    },
    allowedOrigins: env.ALLOWED_ORIGINS || "*",
    ageMin: parseInt(env.AGE_MIN || "16", 10),
    ageMax: parseInt(env.AGE_MAX || "25", 10),
    membershipMonths: parseInt(env.MEMBERSHIP_MONTHS || "12", 10),
    programmeLabel: env.PROGRAMME_LABEL || "Postcode Lottery Programme",
    verifiedLabel: env.VERIFIED_LABEL || "Verified 16-25",
    fundedLabel: env.FUNDED_LABEL || "Funded Membership",
    applicationTtlSeconds: parseInt(env.APPLICATION_TTL_SECONDS || "86400", 10),
    lockTtlSeconds: 30,
    maxApplicationsPerEmailPerDay: 3,
    maxApplicationsPerIpPerDay: 20,
  };
}

export function missingConfig(cfg) {
  const missing = [];
  if (!cfg.veriff.apiUrl) missing.push("VERIFF_API_URL");
  if (!cfg.veriff.apiKey) missing.push("VERIFF_API_KEY");
  if (!cfg.veriff.sharedSecret) missing.push("VERIFF_SHARED_SECRET");
  if (!cfg.ghost.url) missing.push("GHOST_URL");
  if (!cfg.ghost.adminKey) missing.push("GHOST_ADMIN_API_KEY");
  return missing;
}
