import { loadDotEnv } from "./lib-env.mjs";

loadDotEnv();

const { listTiers } = await import("../api/_lib/ghost.js");

try {
  const tiers = await listTiers();
  if (tiers.length === 0) {
    console.log("no tiers found");
  }
  for (const tier of tiers) {
    console.log(
      [
        tier.id,
        tier.name,
        `visibility=${tier.visibility}`,
        `active=${tier.active}`,
        `monthly=${tier.monthly_price} ${tier.currency}`,
        `yearly=${tier.yearly_price} ${tier.currency}`,
      ].join("  "),
    );
  }
} catch (err) {
  console.error(`ghost tiers failed ${err.status}`);
  console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
}
