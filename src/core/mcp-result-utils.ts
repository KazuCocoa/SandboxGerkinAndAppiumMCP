export function extractTextFromMcpData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;

  const directTextKeys = ["text", "source", "pageSource", "xml", "value"];
  for (const key of directTextKeys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }

  const content = record.content;
  if (Array.isArray(content)) {
    const textChunks: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const text = (item as Record<string, unknown>).text;
      if (typeof text === "string") {
        textChunks.push(text);
      }
    }
    if (textChunks.length > 0) {
      return textChunks.join("\n");
    }
  }

  try {
    return JSON.stringify(data);
  } catch {
    return "";
  }
}
