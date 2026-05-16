import type { StepDefinition } from "../../types.js";

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

        const source = typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);

        if (!source.includes(expectedText)) {
          throw new Error(`Expected text not visible: ${expectedText}`);
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
