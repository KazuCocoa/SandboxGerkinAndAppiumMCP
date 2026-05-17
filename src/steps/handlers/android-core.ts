import type { StepDefinition } from "../../types.js";
import { extractTextFromMcpData } from "../../core/mcp-result-utils.js";

export function androidCoreHandlers(): StepDefinition[] {
  return [
    {
      description: "Launch the app",
      pattern: /^I launch the app$/,
      priority: 100,
      handler: async (ctx, mcp) => {
        await mcp.callTool("appium_app_lifecycle", {
          action: "activate",
          sessionId: ctx.sessionId
        });
      }
    },
    {
      description: "Launch app by package",
      pattern: /^I launch app with package "([^"]+)"$/,
      priority: 100,
      handler: async (ctx, mcp, packageName) => {
        await mcp.callTool("appium_app_lifecycle", {
          action: "activate",
          id: packageName,
          name: packageName,
          sessionId: ctx.sessionId
        });
      }
    },
    {
      description: "Tap by accessibility id",
      pattern: /^I tap the element with accessibility id "([^"]+)"$/,
      priority: 100,
      handler: async (ctx, mcp, locator) => {
        await mcp.callTool("appium_gesture", {
          action: "tap",
          strategy: "accessibility id",
          selector: locator,
          sessionId: ctx.sessionId
        });
      }
    },
    {
      description: "Tap by visible text",
      pattern: /^I tap the text "([^"]+)"$/,
      priority: 95,
      handler: async (ctx, mcp, text) => {
        const tapped = await tapTextWithFallback(ctx.sessionId, mcp, text);
        if (!tapped) {
          throw new Error(`Unable to tap text: ${text}`);
        }
      }
    },
    {
      description: "Tap one-of visible texts",
      pattern: /^I tap one of texts "([^"]+)"$/,
      priority: 94,
      handler: async (ctx, mcp, candidatesRaw) => {
        const candidates = parsePipeSeparatedCandidates(candidatesRaw, "tap");

        const maxScrollAttempts = 4;
        for (let attempt = 0; attempt <= maxScrollAttempts; attempt += 1) {
          for (const candidate of candidates) {
            const beforeSource = await getPageSourceText(mcp, ctx.sessionId);
            const tapped = await tapTextWithFallback(ctx.sessionId, mcp, candidate);
            if (!tapped) {
              continue;
            }

            await sleep(500);
            const afterSource = await getPageSourceText(mcp, ctx.sessionId);
            if (afterSource !== beforeSource) {
              return;
            }
          }
        }

        throw new Error(`Unable to tap any candidate text: ${candidates.join(", ")}`);
      }
    },
    {
      description: "Tap by resource id",
      pattern: /^I tap the element with id "([^"]+)"$/,
      priority: 90,
      handler: async (ctx, mcp, locator) => {
        await mcp.callTool("appium_gesture", {
          action: "tap",
          strategy: "id",
          selector: locator,
          sessionId: ctx.sessionId
        });
      }
    },
    {
      description: "Type text into accessibility id",
      pattern: /^I enter "([^"]+)" into field "([^"]+)"$/,
      priority: 90,
      handler: async (ctx, mcp, text, locator) => {
        await mcp.callTool("appium_set_value", {
          strategy: "accessibility id",
          selector: locator,
          value: text,
          sessionId: ctx.sessionId
        });
      }
    },
    {
      description: "Take a screenshot",
      pattern: /^I take a screenshot named "([^"]+)"$/,
      priority: 80,
      handler: async (ctx, mcp, name) => {
        const result = await mcp.callTool("appium_screenshot", {
          name,
          sessionId: ctx.sessionId
        });

        const path = typeof (result.data as Record<string, unknown> | undefined)?.path === "string"
          ? ((result.data as Record<string, unknown>).path as string)
          : `${name}.png`;

        ctx.screenshots.push({ name, path });
      }
    },
    {
      description: "Assert visible text",
      pattern: /^I assert the text "([^"]+)" is visible$/,
      priority: 80,
      handler: async (ctx, mcp, expectedText) => {
        const source = await getPageSourceText(mcp, ctx.sessionId);

        if (!source.includes(expectedText)) {
          throw new Error(`Expected text not visible: ${expectedText}`);
        }
      }
    },
    {
      description: "Assert one-of visible texts",
      pattern: /^I assert one of texts "([^"]+)" is visible$/,
      priority: 79,
      handler: async (ctx, mcp, candidatesRaw) => {
        const candidates = parsePipeSeparatedCandidates(candidatesRaw, "assertion");
        const source = await getPageSourceText(mcp, ctx.sessionId);
        const matched = candidates.find((candidate) => source.includes(candidate));
        if (!matched) {
          const visibleTexts = extractVisibleTexts(source).slice(0, 20).join(" | ");
          throw new Error(
            `None of expected texts are visible: ${candidates.join(", ")}. Visible texts sample: ${visibleTexts}`
          );
        }
      }
    },
    {
      description: "Assert current Android package",
      pattern: /^I assert current package is "([^"]+)"$/,
      priority: 79,
      handler: async (ctx, mcp, expectedPackage) => {
        const actualPackage = await resolveCurrentPackageViaMcp(mcp, ctx.sessionId);

        if (!actualPackage) {
          throw new Error(
            "Unable to determine current package via MCP tools (getCurrentPackage and page-source inference)."
          );
        }

        if (actualPackage !== expectedPackage) {
          throw new Error(`Expected package ${expectedPackage}, but current package is ${actualPackage}`);
        }
      }
    },
    {
      description: "Scroll directional",
      pattern: /^I scroll "(up|down|left|right)" (\d+) times$/,
      priority: 70,
      handler: async (ctx, mcp, direction, count) => {
        const loops = Number(count);
        for (let i = 0; i < loops; i += 1) {
          await mcp.callTool("appium_gesture", {
            action: "scroll",
            direction,
            sessionId: ctx.sessionId
          });
        }
      }
    },
    {
      description: "Wait seconds",
      pattern: /^I wait (\d+) seconds?$/,
      priority: 70,
      handler: async (_ctx, _mcp, seconds) => {
        const value = Number(seconds);
        await new Promise((resolve) => setTimeout(resolve, value * 1000));
      }
    }
  ];
}

function extractCurrentPackage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const keys = ["package", "packageName", "currentPackage", "value"];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  const content = record.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const text = (item as Record<string, unknown>).text;
      if (typeof text !== "string") {
        continue;
      }

      const packageMatch = /([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)/.exec(text);
      if (packageMatch?.[1]) {
        return packageMatch[1];
      }
    }
  }

  return undefined;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tapTextWithFallback(
  sessionId: string | undefined,
  mcp: { callTool: (toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown }> },
  text: string
): Promise<boolean> {
  const selector =
    `//*[@text='${text}' or @content-desc='${text}' ` +
    `or contains(@text,'${text}') or contains(@content-desc,'${text}')]`;

  try {
    const findResult = await mcp.callTool("appium_find_element", {
      strategy: "xpath",
      selector,
      sessionId
    });

    const elementUUID = extractElementUuid(findResult.data);
    if (elementUUID) {
      await mcp.callTool("appium_gesture", {
        action: "tap",
        elementUUID,
        sessionId
      });
      return true;
    }
  } catch {
    // Continue to direct gesture fallback.
  }

  try {
    await mcp.callTool("appium_gesture", {
      action: "tap",
      strategy: "xpath",
      selector,
      sessionId
    });
    return true;
  } catch {
    return false;
  }
}

function extractElementUuid(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const directKeys = ["elementUUID", "elementId", "ELEMENT", "element-6066-11e4-a52e-4f735466cecf"];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  const rawText = extractTextFromMcpData(data);
  const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;
  const uuidMatch = uuidPattern.exec(rawText);
  if (uuidMatch?.[1]) {
    return uuidMatch[1];
  }

  return undefined;
}

async function getPageSourceText(
  mcp: { callTool: (toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown }> },
  sessionId: string | undefined
): Promise<string> {
  const response = await mcp.callTool("appium_get_page_source", {
    sessionId
  });
  return extractTextFromMcpData(response.data);
}

function parsePipeSeparatedCandidates(raw: string, context: "tap" | "assertion"): string[] {
  const candidates = raw
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (candidates.length === 0) {
    throw new Error(`No candidates provided for one-of text ${context}`);
  }

  return candidates;
}

function extractVisibleTexts(source: string): string[] {
  const texts = new Set<string>();
  const textAttrPattern = /\btext="([^"]+)"/g;
  const contentDescPattern = /\bcontent-desc="([^"]+)"/g;

  for (const pattern of [textAttrPattern, contentDescPattern]) {
    let match = pattern.exec(source);
    while (match) {
      const value = match[1]?.trim();
      if (value) {
        texts.add(value);
      }
      match = pattern.exec(source);
    }
  }

  return Array.from(texts);
}

async function resolveCurrentPackageViaMcp(
  mcp: { callTool: (toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown }> },
  sessionId: string | undefined
): Promise<string | undefined> {
  const toolResult = await mcp.callTool("appium_execute_mobile_method", {
    method: "getCurrentPackage",
    sessionId
  });

  const packageFromTool = toolResult.success ? extractCurrentPackage(toolResult.data) : undefined;
  const source = await getPageSourceText(mcp, sessionId);
  const packageFromSource = inferPackageFromPageSource(source);

  // Prefer package derived from current UI tree because mobile getCurrentPackage can lag on some emulator images.
  if (packageFromSource) {
    return packageFromSource;
  }

  return packageFromTool;
}

function inferPackageFromPageSource(source: string): string | undefined {
  const packageAttr = /\bpackage="([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)"/.exec(source);
  if (packageAttr?.[1]) {
    return packageAttr[1];
  }

  const resourceIdPrefix = /\bresource-id="([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+):id\//.exec(source);
  if (resourceIdPrefix?.[1]) {
    return resourceIdPrefix[1];
  }

  return undefined;
}
