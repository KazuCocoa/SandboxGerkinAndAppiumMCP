import type { StepDefinition } from "../types.js";

interface ResolvedStep {
  definition: StepDefinition;
  args: string[];
  isLlmFallback?: boolean;
}

export class StepRegistry {
  private readonly definitions: StepDefinition[] = [];
  private llmFallback: StepDefinition | null = null;

  register(definition: StepDefinition): void {
    const collision = this.definitions.find(
      (item) => item.pattern.source === definition.pattern.source
    );
    if (collision) {
      throw new Error(`Step pattern collision: ${definition.pattern}`);
    }

    this.definitions.push(definition);
    this.definitions.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  registerMany(definitions: StepDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  setLlmFallback(definition: StepDefinition): void {
    this.llmFallback = definition;
  }

  resolve(stepText: string): ResolvedStep | undefined {
    for (const definition of this.definitions) {
      const match = definition.pattern.exec(stepText);
      if (!match) {
        continue;
      }
      return {
        definition,
        args: match.slice(1),
        isLlmFallback: false
      };
    }

    // Fall back to LLM if no pattern matched
    if (this.llmFallback) {
      return {
        definition: this.llmFallback,
        args: [stepText],
        isLlmFallback: true
      };
    }

    return undefined;
  }
}

export type { ResolvedStep };
