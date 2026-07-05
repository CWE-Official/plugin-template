# CWE Plugin Template — `player-favorites`

A **working, tested CasinoWebEngine plugin** you copy and rename. It exercises every plugin
capability except money movement: a plugin-owned dataset, player + admin HTTP routes, a backoffice
surface page, a nightly job, typed settings, an event, and a migration. (Provider/money plugins
additionally register a `ProviderAdapter` and move money exclusively by dispatching wallet
commands through `ctx.commands` — contact the CWE team for the provider reference integration.)

```bash
pnpm install
pnpm test        # unit tests against the in-memory PluginContext — no infra needed
pnpm build       # one self-contained ESM bundle → dist/index.js
```

## How a plugin is put together

1. **`src/manifest.ts`** — everything the platform needs to know, declared up front:
   permissions (fail-closed allowlists), settings schema, datasets, routes, jobs, migrations,
   backoffice surfaces. Handlers are referenced **by name**.
2. **`src/handlers/`** — the named implementations. Handlers receive a sanitized request and the
   `PluginContext` — the ONLY surface a plugin may touch. There is no database handle, no raw
   secret, no other tenant's data, ever.
3. **`src/index.ts`** — `export default definePlugin({ manifest, handlers, hooks })`.

Contract rules the platform enforces at runtime (and `validateManifest` checks statically):

- state changes go through `ctx.commands.execute` (allowlisted per manifest);
- events out go through `ctx.events.emit`, namespaced `plugin.<your-key>.*`;
- datasets are validated on every write, quota-capped, tenant-scoped by the host;
- outbound HTTP only to `manifest.network.allowedHosts`, HTTPS only, secrets injected host-side;
- player routes get `req.player.id` from the host session — never trust ids from the body;
- callback routes MUST call `req.verifySignature(...)` before trusting the body.

## Testing

`@cwe-platform/plugin-sdk/testing` gives you a full in-memory `PluginContext`:

```ts
import { createTestContext } from "@cwe-platform/plugin-sdk/testing";
import plugin from "../src/index.js";

const { ctx, harness } = createTestContext({
  definition: plugin,
  settings: { maxFavorites: 3 },
  secrets: { apiKey: "test" },
  httpMock: () => ({ status: 200, json: { ok: true } }),
});
await harness.invokeRoute("/favorites", { player: { id: "p1" }, body: { gameKey: "g" } });
```

Permissions are **enforced in tests too** — the harness rejects exactly what the real host
rejects (same error names/codes; the platform runs a conformance suite to guarantee it).

## Dev loop against a real runtime

You need a CWE dev runtime with the plugin dev harness enabled — ask your CWE platform contact
for access (runtime URL + staff credentials). Then:

```bash
npx @cwe-platform/plugin-cli login     # staff login → saves devToken into cwe-plugin.json
npx @cwe-platform/plugin-cli dev       # watch → build → sideload → tail logs
npx @cwe-platform/plugin-cli validate  # run the full plugin doctor on the runtime
```

Configure the CLI in `cwe-plugin.json` (`login` fills in the token):

```json
{ "runtimeUrl": "http://localhost:3000", "pluginKey": "player-favorites" }
```

Staff tokens expire after ~15 minutes; for long `dev` sessions export
`CWE_STAFF_EMAIL` / `CWE_STAFF_PASSWORD` and the watcher re-logs-in automatically.

## Versioning & publishing

- `manifest.runtimeCompat` must include the SDK minor you compiled against (SDK `major.minor` ==
  the platform's `RUNTIME_API_VERSION`).
- Migrations are forward-only and idempotent; a rollback (pin) never un-runs them, so keep new
  record shapes readable one version back.
- Release channels: `dev → beta → stable`. The platform operator publishes catalog versions;
  your deliverable is the `dist/index.js` bundle + manifest.
