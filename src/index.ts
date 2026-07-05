import { definePlugin } from "@cwe-platform/plugin-sdk";
import { manifest } from "./manifest.js";
import { addFavorite, adminList, adminStats, listFavorites } from "./handlers/routes.js";
import { cleanup } from "./handlers/jobs.js";
import { normalizeAddedAt } from "./handlers/migrations.js";

/**
 * The plugin entry: default export = the definePlugin object the platform
 * loads. Manifest declarations reference handlers BY NAME — the platform's
 * doctor (and `validateManifest` from the SDK's /testing kit) verify every
 * reference resolves.
 */
const plugin = definePlugin({
  manifest,
  handlers: {
    routes: {
      "list-favorites": listFavorites,
      "add-favorite": addFavorite,
      "admin-list": adminList,
      "admin-stats": adminStats,
    },
    jobs: {
      cleanup,
    },
    migrations: {
      "normalize-added-at": normalizeAddedAt,
    },
  },
  hooks: {
    onInstall(ctx) {
      ctx.logger.info("player-favorites.installed");
    },
    onUninstall(ctx) {
      ctx.logger.info("player-favorites.uninstalled");
    },
  },
});

export default plugin;
export { manifest };
