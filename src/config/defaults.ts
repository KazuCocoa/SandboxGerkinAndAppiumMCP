export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_RETRY_COUNT = 2;
export const DEFAULT_PLATFORM = "android";

export interface RunnerConfig {
  appiumMcpCommand: string;
  appiumMcpArgs: string[];
  platform: "android" | "ios";
  mcpMode: "stub" | "real";
}

export function loadConfigFromEnv(): RunnerConfig {
  const mcpMode = process.env.APPIUM_MCP_MODE === "real" ? "real" : "stub";
  const rawArgs = process.env.APPIUM_MCP_ARGS ?? "";
  const parsedArgs = rawArgs
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);

  const defaultCommand = mcpMode === "real" ? "npx" : "appium-mcp";
  const defaultArgs = mcpMode === "real" ? ["-y", "appium-mcp"] : [];

  return {
    appiumMcpCommand: process.env.APPIUM_MCP_COMMAND ?? defaultCommand,
    appiumMcpArgs: parsedArgs.length > 0 ? parsedArgs : defaultArgs,
    platform: process.env.PLATFORM === "ios" ? "ios" : "android",
    mcpMode
  };
}
