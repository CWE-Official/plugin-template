import type { PluginContext } from "@cwe-platform/plugin-sdk";
import type { Favorite } from "../manifest.js";

/**
 * Nightly cleanup: drop favorites older than `retentionDays`. Jobs must be
 * IDEMPOTENT — the scheduler may re-run a slot after a crash, and a manual
 * trigger can overlap a scheduled one.
 */
export async function cleanup(ctx: PluginContext): Promise<void> {
  const { retentionDays = 365 } = ctx.settings.get<{ retentionDays?: number }>();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const favorites = ctx.datasets.collection<Favorite>("favorites");

  let cursor: string | undefined;
  let removed = 0;
  for (;;) {
    const page = await favorites.query({ cursor, limit: 200 });
    for (const record of page.records) {
      if (Date.parse(record.value.addedAt) < cutoff) {
        await favorites.delete(record.key);
        removed += 1;
      }
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  ctx.logger.info("favorites.cleanup", { removed, retentionDays });
}
