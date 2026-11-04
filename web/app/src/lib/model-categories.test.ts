import { describe, expect, it } from "vitest";
import {
  filterModelsByCategory,
  getAvailableCategories,
  getCategoryLabel,
  getModelCategory,
} from "./model-categories";
import type { Model } from "../types/api";

function model(partial: Partial<Model> & Pick<Model, "id" | "model_name">): Model {
  return {
    namespace: "ns",
    container: partial.model_name,
    status: "online",
    first_seen: "2026-01-01T00:00:00Z",
    last_seen: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("getCategoryLabel", () => {
  it("maps known categories to friendly labels", () => {
    expect(getCategoryLabel("chat")).toBe("Chat");
    expect(getCategoryLabel("embedding")).toBe("Embedding");
    expect(getCategoryLabel("reranker")).toBe("Reranker");
    expect(getCategoryLabel("speech")).toBe("Speech");
  });

  it("returns raw identifiers for custom categories", () => {
    expect(getCategoryLabel("vision")).toBe("vision");
  });
});

describe("getModelCategory", () => {
  it("returns the category when present", () => {
    expect(getModelCategory({ category: "speech" })).toBe("speech");
  });

  it("falls back to chat when category is missing or empty", () => {
    expect(getModelCategory({})).toBe("chat");
    expect(getModelCategory({ category: "" })).toBe("chat");
  });
});

describe("getAvailableCategories", () => {
  it("deduplicates and sorts category ids", () => {
    const models = [
      model({ id: 1, model_name: "a", category: "speech" }),
      model({ id: 2, model_name: "b", category: "chat" }),
      model({ id: 3, model_name: "c", category: "embedding" }),
      model({ id: 4, model_name: "d", category: "speech" }),
      model({ id: 5, model_name: "e", category: "reranker" }),
    ];
    expect(getAvailableCategories(models)).toEqual([
      "chat",
      "embedding",
      "reranker",
      "speech",
    ]);
  });

  it("sorts mixed-case ids case-insensitively", () => {
    const models = [
      model({ id: 1, model_name: "a", category: "Decision" }),
      model({ id: 2, model_name: "b", category: "chat" }),
      model({ id: 3, model_name: "c", category: "Embedding" }),
    ];
    expect(getAvailableCategories(models)).toEqual([
      "chat",
      "Decision",
      "Embedding",
    ]);
  });

  it("includes archived models and applies the chat fallback", () => {
    const models = [
      model({ id: 1, model_name: "a", category: "vision", status: "archived" }),
      model({ id: 2, model_name: "b" }),
    ];
    expect(getAvailableCategories(models)).toEqual(["chat", "vision"]);
  });

  it("returns an empty list for no models", () => {
    expect(getAvailableCategories([])).toEqual([]);
  });
});

describe("filterModelsByCategory", () => {
  const models = [
    model({ id: 1, model_name: "a", category: "speech", status: "online" }),
    model({ id: 2, model_name: "b", category: "speech", status: "down" }),
    model({ id: 3, model_name: "c", category: "chat", status: "online" }),
    model({ id: 4, model_name: "d", category: "embedding", status: "archived" }),
  ];

  it("keeps every model, including archived, for null (All)", () => {
    expect(filterModelsByCategory(models, null)).toHaveLength(4);
  });

  it("matches the exact category id", () => {
    const speech = filterModelsByCategory(models, "speech");
    expect(speech.map((m) => m.model_name)).toEqual(["a", "b"]);
    expect(filterModelsByCategory(models, "chat").map((m) => m.model_name)).toEqual(["c"]);
    expect(filterModelsByCategory(models, "embedding").map((m) => m.model_name)).toEqual(["d"]);
  });

  it("returns nothing for an unknown category", () => {
    expect(filterModelsByCategory(models, "vision")).toEqual([]);
  });
});
