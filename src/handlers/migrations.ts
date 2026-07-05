import type { PluginContext, PluginMigrationHelper } from "@cwe-platform/plugin-sdk";
import type { Favorite } from "../manifest.js";

/**
 * Migration example. Rules that keep upgrades safe:
 *  - migrations are FORWARD-ONLY and must be idempotent (return null for
 *    records that are already in the new shape — re-runs then skip them);
 *  - the helper iterates in batches of 500 and checkpoints between batches,
 *    so a failed upgrade resumes where it stopped;
 *  - a rollback (pin to the previous version) never un-runs a migration, so
 *    new record shapes must stay readable one version back.
 */
export async function normalizeAddedAt(
  ctx: PluginContext,
  helper: PluginMigrationHelper,
): Promise<void> {
  const { processed } = await helper.transformDataset<Favorite>("favorites", ({ key, value }) => {
    const parsed = Date.parse(value.addedAt);
    const iso = Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
    if (iso === value.addedAt) return null; // already normalized — idempotent
    return { key, value: { ...value, addedAt: iso } };
  });
  ctx.logger.info("favorites.migration.normalize-added-at", { processed });
}
