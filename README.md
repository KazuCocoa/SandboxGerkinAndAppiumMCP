# Sandbox Gherkin And Appium MCP

Prototype runner that executes Gherkin scenarios against appium-mcp directly.

## Quick Start

```bash
npm install
npm run dev -- run --feature features/smoke/settings.feature --dry-run
```

Run with real appium-mcp adapter:

```bash
APPIUM_MCP_MODE=real npm run dev -- run --feature features/smoke/settings.feature --real-mcp
```

Optional environment variables:

- `APPIUM_MCP_COMMAND` default is `appium-mcp`
- `APPIUM_MCP_ARGS` space-separated args passed to the MCP process
- `PLATFORM` `android` or `ios`
- `APPIUM_UDID` target a specific device/emulator ID
- `APPIUM_DEVICE_NAME` explicit device name for session creation
- `APPIUM_PLATFORM_VERSION` explicit platform version
- `APPIUM_NO_RESET` set `1` or `true` to keep app state between runs
- `DEBUG_APPIUM_SESSION` set `1` to print requested capabilities and session response summary

Android smoke test (guarded):

```bash
RUN_ANDROID_SMOKE=1 APPIUM_MCP_MODE=real npm run test:e2e:android
```

## Architecture & Design Decisions

### MCP Response Format

**Key Insight:** appium-mcp responses are optimized for **LLM consumption**, not direct code usage.

**Why?** MCP is designed for conversational tool use:
- Responses use `content` arrays with human-readable text for LLM context
- Structured data is inconsistently keyed (e.g., `elementUUID`, `elementId`, `ELEMENT`, etc.)
- Critical information often embedded in natural language text, requiring regex extraction
- Multiple optional key names reflect LLM flexibility over strict contracts

**Code Impact:**
- Handlers require extraction functions to normalize responses (`extractElementUuid`, `extractCurrentPackage`, etc.)
- Fallback parsing is necessary (e.g., regex-based UUID extraction from response text)
- No strict response schema contract between MCP server and client code

**Tradeoff:** MCP eliminates language bindings (Java/Python/JS drivers) but introduces response parsing complexity instead. The binding problem moves from language to data structure.

**Future Options:**
1. **Response Normalization Layer** — Wrap MCP calls to standardize responses before handlers see them
2. **Hybrid Approach** — Use MCP for complex operations (finding elements, page source), direct Appium API for simple actions
3. **Accept Parsing Overhead** — Keep current extraction utilities; they're manageable for a prototype

### Notes

- Deterministic step registry is the primary path.
- Optional fallback can convert unmatched steps into canonical actions.
- This prototype is Android-first.
- MCP logging is captured per-session to `mcp-logs/` directory for debugging.
