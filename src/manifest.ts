import { settingsField, type PluginManifest } from "@cwe-platform/plugin-sdk";
import { z } from "zod";

/**
 * player-favorites — a small but REAL plugin exercising every v2 capability
 * except money/provider flows (for a provider plugin, see `plugins/sloterv`
 * in the platform repo):
 *
 *  - a plugin-owned dataset (`favorites`) with indexed queries;
 *  - player-surface routes (session-bound: a player only sees their own rows);
 *  - an admin route feeding a backoffice surface page (table + stats);
 *  - a nightly cleanup job;
 *  - typed settings and a migration example.
 */
export const favoriteSchema = z.object({
  /** Business key: `${playerId}:${gameKey}` — one row per player+game. */
  favKey: z.string().min(3),
  playerId: z.string().min(1),
  gameKey: z.string().min(1),
  addedAt: z.string().datetime(),
});

export type Favorite = z.infer<typeof favoriteSchema>;

export const favKey = (playerId: string, gameKey: string): string => `${playerId}:${gameKey}`;

export const listQuerySchema = z
  .object({
    cursor: z.string().min(1).max(191).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const addBodySchema = z.object({ gameKey: z.string().min(1).max(128) }).strict();

export const manifest: PluginManifest = {
  key: "player-favorites",
  name: "Player Favorites",
  author: "you",
  version: "0.1.0",
  kind: "integration",
  runtimeCompat: ">=0.1.0 <0.2.0",
  description: "Players bookmark their favorite games; operators see totals in the backoffice.",

  permissions: {
    // This plugin moves no money and dispatches no commands.
    commands: [],
    events: {
      subscribe: [],
      emit: ["plugin.player-favorites.added"],
    },
  },

  settings: {
    fields: {
      maxFavorites: settingsField.number({
        label: "Max favorites per player",
        default: 20,
        zod: z.number().int().min(1).max(500),
      }),
      retentionDays: settingsField.number({
        label: "Days to keep a favorite before the cleanup job drops it",
        default: 365,
        zod: z.number().int().min(1).max(3650),
      }),
    },
  },

  datasets: {
    favorites: {
      schema: favoriteSchema,
      keyField: "favKey",
      indexes: ["playerId", "gameKey"],
      maxRecords: 100_000,
    },
  },

  routes: [
    {
      method: "GET",
      path: "/favorites",
      surface: "player",
      handler: "list-favorites",
      input: { query: listQuerySchema },
    },
    {
      method: "POST",
      path: "/favorites",
      surface: "player",
      handler: "add-favorite",
      input: { body: addBodySchema },
    },
    {
      method: "GET",
      path: "/all",
      surface: "admin",
      handler: "admin-list",
      input: { query: listQuerySchema },
    },
    {
      method: "GET",
      path: "/stats",
      surface: "admin",
      handler: "admin-stats",
    },
  ],

  jobs: {
    cleanup: { schedule: "0 3 * * *", handler: "cleanup", timeoutSec: 300 },
  },

  // Migration example: runs when a tenant upgrades THROUGH this version.
  // (A fresh install never runs it — see the README's upgrade section.)
  migrations: [
    {
      toVersion: "0.1.0",
      handler: "normalize-added-at",
      description: "normalize addedAt to ISO-8601 for records written by pre-releases",
    },
  ],

  surfaces: {
    backoffice: {
      nav: [{ label: "Favorites", pageKey: "favorites" }],
      pages: [
        {
          key: "favorites",
          title: "Player Favorites",
          blocks: [
            { type: "stats", dataRoute: "/stats" },
            {
              type: "table",
              dataRoute: "/all",
              columns: [
                { key: "playerId", label: "Player" },
                { key: "gameKey", label: "Game" },
                { key: "addedAt", label: "Added" },
              ],
            },
          ],
        },
      ],
    },
  },
};
