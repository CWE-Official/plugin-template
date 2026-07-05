import { describe, expect, it } from "vitest";
import { createTestContext, validateManifest } from "@cwe-platform/plugin-sdk/testing";
import plugin from "../src/index.js";

const PLAYER = { id: "player-1" };

function makeContext(overrides: Parameters<typeof createTestContext>[0] = {}) {
  return createTestContext({
    definition: plugin,
    settings: { maxFavorites: 3, retentionDays: 30 },
    ...overrides,
  });
}

describe("manifest", () => {
  it("passes the doctor-lite validation", () => {
    const result = validateManifest(plugin);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("player routes", () => {
  it("adds and lists favorites for the calling player only", async () => {
    const { harness } = makeContext();

    const created = await harness.invokeRoute("POST /favorites", {
      player: PLAYER,
      body: { gameKey: "book-of-cwe" },
    });
    expect(created.status).toBe(201);

    // Another player's favorite must not leak into player-1's list.
    await harness.invokeRoute("POST /favorites", {
      player: { id: "player-2" },
      body: { gameKey: "other-game" },
    });

    const list = await harness.invokeRoute("/favorites", { player: PLAYER });
    const body = list.body as { favorites: Array<{ gameKey: string; playerId: string }> };
    expect(body.favorites).toHaveLength(1);
    expect(body.favorites[0]!.gameKey).toBe("book-of-cwe");
  });

  it("rejects anonymous calls to player-surface routes", async () => {
    const { harness } = makeContext();
    await expect(harness.invokeRoute("/favorites", {})).rejects.toMatchObject({
      name: "UnauthorizedError",
    });
  });

  it("enforces the maxFavorites setting", async () => {
    const { harness } = makeContext();
    for (const game of ["g1", "g2", "g3"]) {
      await harness.invokeRoute("POST /favorites", { player: PLAYER, body: { gameKey: game } });
    }
    const over = await harness.invokeRoute("POST /favorites", {
      player: PLAYER,
      body: { gameKey: "g4" },
    });
    expect(over.status).toBe(409);
    // Re-adding an existing favorite is fine even at the limit (upsert).
    const again = await harness.invokeRoute("POST /favorites", {
      player: PLAYER,
      body: { gameKey: "g1" },
    });
    expect(again.status).toBe(201);
  });

  it("emits the declared namespaced event on add", async () => {
    const { harness } = makeContext();
    await harness.invokeRoute("POST /favorites", { player: PLAYER, body: { gameKey: "g1" } });
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]!.name).toBe("plugin.player-favorites.added");
  });

  it("validates route input with the declared zod schema", async () => {
    const { harness } = makeContext();
    await expect(
      harness.invokeRoute("POST /favorites", { player: PLAYER, body: { wrong: true } }),
    ).rejects.toThrow();
  });
});

describe("permissions (enforced in tests exactly like the host)", () => {
  it("denies undeclared commands", async () => {
    const { ctx } = makeContext();
    await expect(
      ctx.commands.execute({ name: "wallet.credit", input: {} }),
    ).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it("denies non-namespaced event emits", async () => {
    const { ctx } = makeContext();
    await expect(ctx.events.emit({ name: "wallet.credited", payload: {} })).rejects.toMatchObject(
      { name: "ForbiddenError" },
    );
  });
});

describe("dataset quota", () => {
  it("rejects writes beyond the quota with no partial batch", async () => {
    const { ctx, harness } = makeContext({
      datasetQuota: 2,
      settings: { maxFavorites: 100 },
    });
    await harness.invokeRoute("POST /favorites", { player: PLAYER, body: { gameKey: "g1" } });
    await harness.invokeRoute("POST /favorites", { player: PLAYER, body: { gameKey: "g2" } });
    await expect(
      harness.invokeRoute("POST /favorites", { player: PLAYER, body: { gameKey: "g3" } }),
    ).rejects.toMatchObject({ code: "PLUGIN_DATASET_QUOTA_EXCEEDED" });
    expect(await ctx.datasets.collection("favorites").count()).toBe(2);
  });
});

describe("admin surface + job + migration", () => {
  it("admin stats route feeds the surface block", async () => {
    const { harness } = makeContext();
    await harness.invokeRoute("POST /favorites", { player: PLAYER, body: { gameKey: "g1" } });
    const stats = await harness.invokeRoute("/stats", {
      actor: { type: "staff", id: "admin-1" },
    });
    expect(stats.body).toEqual([{ label: "Total favorites", value: 1 }]);
  });

  it("cleanup job drops favorites past retention", async () => {
    const { ctx, harness } = makeContext();
    harness.seedDataset("favorites", [
      {
        key: "player-1:old-game",
        value: {
          favKey: "player-1:old-game",
          playerId: "player-1",
          gameKey: "old-game",
          addedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        key: "player-1:new-game",
        value: {
          favKey: "player-1:new-game",
          playerId: "player-1",
          gameKey: "new-game",
          addedAt: new Date().toISOString(),
        },
      },
    ]);
    await harness.runJob("cleanup");
    expect(await ctx.datasets.collection("favorites").count()).toBe(1);
  });

  it("migration normalizes legacy timestamps and is idempotent", async () => {
    const { harness } = makeContext();
    harness.seedDataset("favorites", [
      {
        key: "player-1:legacy",
        value: {
          favKey: "player-1:legacy",
          playerId: "player-1",
          gameKey: "legacy",
          addedAt: "2026-01-05 10:00:00", // pre-release non-ISO shape
        },
      },
    ]);
    await harness.runMigration("0.1.0");
    const store = harness.datasetStores.get("favorites")!;
    expect(String(store.get("player-1:legacy")!.value.addedAt)).toMatch(/T.*Z$/);
    // Re-run: no throw, still normalized (idempotent).
    await harness.runMigration("0.1.0");
  });
});
