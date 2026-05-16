import type { RunnerConfig } from "../config/defaults.js";
import type { MpcAdapter } from "./mcp-client.js";
import { StubMcpAdapter } from "./mcp-client.js";
import { MpcProcessAdapter } from "./mcp-process-adapter.js";

export function createMcpAdapter(config: RunnerConfig, forceMode?: "stub" | "real"): MpcAdapter {
  const mode = forceMode ?? config.mcpMode;
  if (mode === "real") {
    return new MpcProcessAdapter(config.appiumMcpCommand, config.appiumMcpArgs);
  }
  return new StubMcpAdapter();
}
