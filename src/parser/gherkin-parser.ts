import { readFileSync } from "node:fs";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import type { ParsedFeature, ParsedScenario, ParsedStep, StepKeyword } from "../types.js";

const ALLOWED_KEYWORDS = new Set<StepKeyword>(["Given", "When", "Then", "And", "But"]);

export function parseFeatureFile(featurePath: string): ParsedFeature {
  const source = readFileSync(featurePath, "utf8");
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  const document = parser.parse(source) as any;

  const featureNode = document?.feature;
  if (!featureNode) {
    throw new Error(`No feature found in file: ${featurePath}`);
  }

  const scenarios: ParsedScenario[] = [];
  for (const child of featureNode.children ?? []) {
    const scenarioNode = child?.scenario;
    if (!scenarioNode) {
      continue;
    }

    const steps: ParsedStep[] = (scenarioNode.steps ?? []).map((stepNode: any) => {
      const rawKeyword = String(stepNode.keyword ?? "").trim();
      const keyword = ALLOWED_KEYWORDS.has(rawKeyword as StepKeyword)
        ? (rawKeyword as StepKeyword)
        : "When";

      const parsedStep: ParsedStep = {
        keyword,
        text: String(stepNode.text ?? "").trim()
      };

      const argument = stepNode.argument;
      if (argument?.docString?.content) {
        parsedStep.docString = String(argument.docString.content);
      }
      if (argument?.dataTable?.rows) {
        const rows = argument.dataTable.rows as Array<{ cells: Array<{ value: string }> }>;
        parsedStep.dataTable = dataTableRowsToObjects(rows);
      }
      return parsedStep;
    });

    scenarios.push({
      name: String(scenarioNode.name ?? "Unnamed scenario"),
      tags: (scenarioNode.tags ?? []).map((tag: any) => String(tag.name ?? "")),
      steps
    });
  }

  return {
    name: String(featureNode.name ?? "Unnamed feature"),
    tags: (featureNode.tags ?? []).map((tag: any) => String(tag.name ?? "")),
    scenarios,
    sourcePath: featurePath
  };
}

function dataTableRowsToObjects(rows: Array<{ cells: Array<{ value: string }> }>): Array<Record<string, string>> {
  if (rows.length < 2) {
    return [];
  }

  const headerRow = rows[0];
  if (!headerRow) {
    return [];
  }
  const headers = headerRow.cells.map((cell) => cell.value);
  const entries = rows.slice(1);

  return entries.map((row) => {
    const record: Record<string, string> = {};
    row.cells.forEach((cell, index) => {
      const key = headers[index] ?? `col_${index + 1}`;
      record[key] = cell.value;
    });
    return record;
  });
}
