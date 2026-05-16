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
  const rawArgs = process.env.APPIUM_MCP_ARGS ?? "";
  return {
    appiumMcpCommand: process.env.APPIUM_MCP_COMMAND ?? "appium-mcp",
    appiumMcpArgs: rawArgs.split(" ").map((arg) => arg.trim()).filter((arg) => arg.length > 0),
    platform: process.env.PLATFORM === "ios" ? "ios" : "android",
    mcpMode: process.env.APPIUM_MCP_MODE === "real" ? "real" : "stub"
  };
}
