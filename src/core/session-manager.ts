import { extractTextFromMcpData } from "./mcp-result-utils.js";
import { MpcClient } from "./mcp-client.js";

export class SessionManager {
  constructor(private readonly mcp: MpcClient) {}

  async ensureSession(platform: "android" | "ios"): Promise<string> {
    const existing = this.mcp.getSessionId();
    if (existing) {
      return existing;
    }

    const capabilities = buildCapabilities(platform);

    const response = await this.mcp.callTool("appium_session_management", {
      action: "create",
      platform,
      automationName: platform === "android" ? "UiAutomator2" : "XCUITest",
      capabilities: JSON.stringify(capabilities)
    });

    if (!response.success) {
      throw new Error(response.error ?? "Unable to create Appium session");
    }

    const sessionInfo = parseSessionInfo(response.data);
    if (process.env.DEBUG_APPIUM_SESSION === "1") {
      console.log("[session] requested capabilities:", JSON.stringify(capabilities));
      console.log("[session] create response:", sessionInfo.debugSummary);
    }

    if (!sessionInfo.sessionId) {
      throw new Error(`Session was not created (missing sessionId). ${sessionInfo.debugSummary}`);
    }

    if (platform === "android" && !sessionInfo.debugSummary.toLowerCase().includes("uiautomator2")) {
      console.warn("[session] UiAutomator2 not found in session response summary");
    }

    const sessionId = sessionInfo.sessionId;
    this.mcp.setSessionId(sessionId);
    return sessionId;
  }

  async cleanupSession(): Promise<void> {
    const sessionId = this.mcp.getSessionId();
    if (!sessionId) {
      return;
    }

    await this.mcp.callTool("appium_session_management", {
      action: "delete",
      sessionId
    });

    this.mcp.setSessionId(undefined);
  }
}

function buildCapabilities(platform: "android" | "ios"): Record<string, string | boolean> {
  const capabilities: Record<string, string | boolean> = {
    platformName: platform === "android" ? "Android" : "iOS",
    "appium:automationName": platform === "android" ? "UiAutomator2" : "XCUITest"
  };

  const deviceName = process.env.APPIUM_DEVICE_NAME;
  const udid = process.env.APPIUM_UDID;
  const platformVersion = process.env.APPIUM_PLATFORM_VERSION;
  const noReset = process.env.APPIUM_NO_RESET;

  if (deviceName) {
    capabilities["appium:deviceName"] = deviceName;
  }
  if (udid) {
    capabilities["appium:udid"] = udid;
  }
  if (platformVersion) {
    capabilities["appium:platformVersion"] = platformVersion;
  }
  if (noReset) {
    capabilities["appium:noReset"] = noReset === "1" || noReset.toLowerCase() === "true";
  }

  capabilities["appium:forceAppLaunch"] = true;

  return capabilities;
}

function asSessionId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const session = (value as Record<string, unknown>).sessionId;
  return typeof session === "string" && session.length > 0 ? session : undefined;
}

function parseSessionInfo(data: unknown): { sessionId?: string; debugSummary: string } {
  const direct = asSessionId(data);
  if (direct) {
    return {
      sessionId: direct,
      debugSummary: JSON.stringify(data)
    };
  }

  const rawText = extractTextFromMcpData(data);
  const fromText = extractSessionIdFromText(rawText);
  if (fromText) {
    return {
      sessionId: fromText,
      debugSummary: rawText.slice(0, 500)
    };
  }

  return {
    debugSummary: rawText.length > 0 ? rawText.slice(0, 500) : "No response text"
  };
}

function extractSessionIdFromText(rawText: string): string | undefined {
  if (rawText.length === 0) {
    return undefined;
  }

  const patterns = [
    /"?sessionId"?\s*[:=]\s*"([^"]+)"/i,
    /session\s*id\s*[:=]\s*([a-z0-9-]+)/i,
    /\bID\s*[:=]\s*([a-z0-9-]+)/i,
    /\bwith\s+ID\s*[:=]?\s*([a-z0-9-]+)/i
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(rawText);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}
