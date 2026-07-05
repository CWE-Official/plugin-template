import type { PluginContext, PluginRequest } from "@cwe-platform/plugin-sdk";
import type { z } from "zod";
import {
  favKey,
  type Favorite,
  type addBodySchema,
  type listQuerySchema,
} from "../manifest.js";

/**
 * Route handlers. Contract reminders:
 *  - `req.player.id` is set by the HOST on player-surface routes — never trust
 *    a player id from the body;
 *  - all reads/writes go through `ctx.datasets` (tenant-scoped by the host);
 *  - return `{ status?, body?, headers? }`; throwing maps to the platform's
 *    error envelope.
 */
const favorites = (ctx: PluginContext) => ctx.datasets.collection<Favorite>("favorites");

export async function listFavorites(req: PluginRequest, ctx: PluginContext) {
  const query = req.query as z.infer<typeof listQuerySchema>;
  const page = await favorites(ctx).query({
    where: { playerId: req.player!.id },
    cursor: query.cursor,
    limit: query.limit ?? 50,
  });
  return {
    body: {
      favorites: page.records.map((r) => r.value),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    },
  };
}

export async function addFavorite(req: PluginRequest, ctx: PluginContext) {
  const { gameKey } = req.body as z.infer<typeof addBodySchema>;
  const playerId = req.player!.id;
  const settings = ctx.settings.get<{ maxFavorites?: number }>();
  const max = settings.maxFavorites ?? 20;

  const collection = favorites(ctx);
  const mine = await collection.query({ where: { playerId }, limit: 200 });
  const already = mine.records.some((r) => r.value.gameKey === gameKey);
  if (!already && mine.records.length >= max) {
    return {
      status: 409,
      body: { error: { code: "FAVORITES_LIMIT", message: `Limit is ${max} favorites` } },
    };
  }

  const favorite: Favorite = {
    favKey: favKey(playerId, gameKey),
    playerId,
    gameKey,
    addedAt: new Date().toISOString(),
  };
  await collection.put(favorite.favKey, favorite);
  await ctx.events.emit({
    name: "plugin.player-favorites.added",
    payload: { playerId, gameKey },
  });
  return { status: 201, body: { favorite } };
}

export async function adminList(req: PluginRequest, ctx: PluginContext) {
  const query = req.query as z.infer<typeof listQuerySchema>;
  const page = await favorites(ctx).query({ cursor: query.cursor, limit: query.limit ?? 50 });
  return {
    body: {
      rows: page.records.map((r) => r.value),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    },
  };
}

export async function adminStats(_req: PluginRequest, ctx: PluginContext) {
  const total = await favorites(ctx).count();
  return { body: [{ label: "Total favorites", value: total }] };
}
