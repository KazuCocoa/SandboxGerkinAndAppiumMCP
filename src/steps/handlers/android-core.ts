import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { StepDefinition } from "../../types.js";
import { extractTextFromMcpData } from "../../core/mcp-result-utils.js";

const execFileAsync = promisify(execFile);

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
          appId: packageName,
          packageName,
          sessionId: ctx.sessionId
        });

        // Some environments report success but do not bring the app to foreground.
        await sleep(700);
        let currentPackage = await resolveCurrentPackageFromAdb();
        if (currentPackage !== packageName) {
          const opened = await tryOpenPackageViaAdb(packageName);
          if (opened) {
            await sleep(700);
            currentPackage = await resolveCurrentPackageFromAdb();
          }
        }

        if (currentPackage && currentPackage !== packageName) {
          throw new Error(`Expected package ${packageName} to be foreground, but found ${currentPackage}`);
        }
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
        const candidates = candidatesRaw
          .split("|")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);

        if (candidates.length === 0) {
          throw new Error("No candidates provided for one-of text tap");
        }

        const maxScrollAttempts = 4;
        for (let attempt = 0; attempt <= maxScrollAttempts; attempt += 1) {
          for (const candidate of candidates) {
            const tapped = await tapTextWithFallback(ctx.sessionId, mcp, candidate);
            if (tapped) {
              return;
            }
          }

          if (attempt < maxScrollAttempts) {
            await mcp.callTool("appium_gesture", {
              action: "scroll",
              direction: "down",
              sessionId: ctx.sessionId
            });
            await sleep(500);
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
        const response = await mcp.callTool("appium_get_page_source", {
          sessionId: ctx.sessionId
        });

        const source = extractTextFromMcpData(response.data);

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
        const candidates = candidatesRaw
          .split("|")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);

        if (candidates.length === 0) {
          throw new Error("No candidates provided for one-of text assertion");
        }

        const response = await mcp.callTool("appium_get_page_source", {
          sessionId: ctx.sessionId
        });

        const source = extractTextFromMcpData(response.data);
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
        const toolResult = await mcp.callTool("appium_execute_mobile_method", {
          method: "getCurrentPackage",
          sessionId: ctx.sessionId
        });

        const packageFromTool = extractCurrentPackage(toolResult.data);
        const actualPackage = packageFromTool ?? (await resolveCurrentPackageFromAdb());

        if (!actualPackage) {
          throw new Error(
            "Unable to determine current package. Set APPIUM_UDID for adb fallback or verify appium_execute_mobile_method support."
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

async function resolveCurrentPackageFromAdb(): Promise<string | undefined> {
  const udid = process.env.APPIUM_UDID;
  if (!udid) {
    return undefined;
  }

  const commands: string[][] = [
    ["-s", udid, "shell", "dumpsys", "window", "windows"],
    ["-s", udid, "shell", "dumpsys", "window"],
    ["-s", udid, "shell", "dumpsys", "activity", "activities"]
  ];

  for (const args of commands) {
    try {
      const { stdout } = await execFileAsync("adb", args);
      const fromText = extractPackageFromAdbText(stdout);
      if (fromText) {
        return fromText;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

async function tryOpenPackageViaAdb(packageName: string): Promise<boolean> {
  const udid = process.env.APPIUM_UDID;
  if (!udid) {
    return false;
  }

  // For Settings use explicit intent action; for other packages use monkey launcher fallback.
  if (packageName === "com.android.settings") {
    try {
      await execFileAsync("adb", [
        "-s",
        udid,
        "shell",
        "am",
        "start",
        "-a",
        "android.settings.SETTINGS"
      ]);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await execFileAsync("adb", [
      "-s",
      udid,
      "shell",
      "monkey",
      "-p",
      packageName,
      "-c",
      "android.intent.category.LAUNCHER",
      "1"
    ]);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPackageFromAdbText(stdout: string): string | undefined {
  const lines = stdout.split("\n");
  const candidateLine = lines.find((entry) => {
    const value = entry.toLowerCase();
    return (
      value.includes("mcurrentfocus") ||
      value.includes("mfocusedapp") ||
      value.includes("mresumedactivity") ||
      value.includes("topresumedactivity")
    );
  });

  if (!candidateLine) {
    return undefined;
  }

  const slashPattern = /([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)\//;
  const slashMatch = slashPattern.exec(candidateLine);
  if (slashMatch?.[1]) {
    return slashMatch[1];
  }

  const packagePattern = /packageName=([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)/;
  const packageMatch = packagePattern.exec(candidateLine);
  if (packageMatch?.[1]) {
    return packageMatch[1];
  }

  return undefined;
}

async function tapTextWithFallback(
  sessionId: string | undefined,
  mcp: { callTool: (toolName: string, args: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown }> },
  text: string
): Promise<boolean> {
  const selector = `//*[@text='${text}' or @content-desc='${text}']`;
  let snapshotSource = "";

  try {
    const sourceResult = await mcp.callTool("appium_get_page_source", {
      sessionId
    });
    snapshotSource = extractTextFromMcpData(sourceResult.data);
    const adbTapped = await tapByAdbBoundsFromPageSource(snapshotSource, text);
    if (adbTapped) {
      return true;
    }
  } catch {
    // Continue to Appium-based fallbacks.
  }

  if (!snapshotSource.includes(text)) {
    return false;
  }

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
    // Fallback below.
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
    // Continue to adb-bounds fallback.
  }

  try {
    const sourceResult = await mcp.callTool("appium_get_page_source", {
      sessionId
    });
    const source = extractTextFromMcpData(sourceResult.data);
    return await tapByAdbBoundsFromPageSource(source, text);
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

async function tapByAdbBoundsFromPageSource(source: string, targetText: string): Promise<boolean> {
  const udid = process.env.APPIUM_UDID;
  if (!udid || source.length === 0) {
    return false;
  }

  const bounds = findBoundsForText(source, targetText);
  if (!bounds) {
    return false;
  }

  const [x1, y1, x2, y2] = bounds;
  if ([x1, y1, x2, y2].some((value) => Number.isNaN(value))) {
    return false;
  }

  const x = Math.floor((x1 + x2) / 2);
  const y = Math.floor((y1 + y2) / 2);

  try {
    await execFileAsync("adb", ["-s", udid, "shell", "input", "tap", String(x), String(y)]);
    return true;
  } catch {
    return false;
  }
}

function findBoundsForText(source: string, targetText: string): [number, number, number, number] | undefined {
  const escaped = escapeRegex(targetText);
  const tagPattern = /<[^>]+>/g;
  let tagMatch = tagPattern.exec(source);

  while (tagMatch) {
    const tag = tagMatch[0];
    const hasText = new RegExp(`\\btext=("|')${escaped}\\1`, "i").test(tag);
    const hasContentDesc = new RegExp(`\\bcontent-desc=("|')${escaped}\\1`, "i").test(tag);

    if (hasText || hasContentDesc) {
      const boundsMatch = /\bbounds=("|')\[(\d+),(\d+)\]\[(\d+),(\d+)\]\1/i.exec(tag);
      if (boundsMatch) {
        return [
          Number(boundsMatch[2]),
          Number(boundsMatch[3]),
          Number(boundsMatch[4]),
          Number(boundsMatch[5])
        ];
      }
    }

    tagMatch = tagPattern.exec(source);
  }

  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
