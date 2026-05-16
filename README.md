# Sandbox Gherkin And Appium MCP

Prototype runner that executes Gherkin scenarios against appium-mcp directly.

## Quick Start

```bash
npm install
npm run dev -- run --feature features/smoke/login.feature --dry-run
```

Run with real appium-mcp adapter:

```bash
APPIUM_MCP_MODE=real npm run dev -- run --feature features/smoke/login.feature --real-mcp
```

Optional environment variables:

- `APPIUM_MCP_COMMAND` default is `appium-mcp`
- `APPIUM_MCP_ARGS` space-separated args passed to the MCP process
- `PLATFORM` `android` or `ios`

Android smoke test (guarded):

```bash
RUN_ANDROID_SMOKE=1 APPIUM_MCP_MODE=real npm run test:e2e:android
```

## Notes

- Deterministic step registry is the primary path.
- Optional fallback can convert unmatched steps into canonical actions.
- This prototype is Android-first.
