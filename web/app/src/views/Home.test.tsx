import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Home } from "./Home";
import type { MetricsMeta, Model } from "../types/api";

const hooks = vi.hoisted(() => ({
  models: null as Model[] | null,
  metricsMeta: [] as MetricsMeta[],
  isLoading: false,
  isError: false,
}));

vi.mock("../hooks/useData", () => ({
  useModels: () => ({
    data: hooks.models,
    isLoading: hooks.isLoading,
    isError: hooks.isError,
  }),
  useMetricsMeta: () => ({ data: hooks.metricsMeta }),
}));

function m(
  id: number,
  name: string,
  category: string | undefined,
  status: Model["status"],
): Model {
  return {
    id,
    model_name: name,
    namespace: "ns",
    container: name,
    status,
    category,
    first_seen: "2026-01-01T00:00:00Z",
    last_seen: "2026-01-01T00:00:00Z",
  };
}

const FIXTURE: Model[] = [
  m(1, "llama-4-scout-17b", "chat", "online"),
  m(2, "qwen3-32b", "chat", "online"),
  m(3, "whisper-large-v3", "speech", "online"),
  m(4, "mxbai-embed-large:latest", "embedding", "online"),
  m(5, "nomic-embed-text-v2-moe", "embedding", "down"),
  m(6, "canary-1b-flash", "speech", "down"),
  m(7, "old-model", "vision", "archived"),
];

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

function chip(label: string): HTMLElement {
  return screen.getByRole("radio", { name: label });
}

function setModels(models: Model[] | null) {
  hooks.models = models;
}

afterEach(() => {
  cleanup();
  hooks.models = null;
  hooks.metricsMeta = [];
  hooks.isLoading = false;
  hooks.isError = false;
});

describe("Home category filter", () => {
  it("shows every noncollapsed status section when unfiltered", () => {
    setModels(FIXTURE);
    renderHome();

    expect(screen.getByText("Online (4)")).toBeTruthy();
    expect(screen.getByText("Temporarily Down (2)")).toBeTruthy();
    expect(screen.getByText("Archived (1)")).toBeTruthy();
    expect(screen.getByText("llama-4-scout-17b")).toBeTruthy();
    expect(screen.getByText("nomic-embed-text-v2-moe")).toBeTruthy();
    // Archived starts collapsed
    expect(screen.queryByText("old-model")).toBeNull();
  });

  it("selecting Speech filters both Online and Temporarily Down without changing section labels", () => {
    setModels(FIXTURE);
    renderHome();

    fireEvent.click(chip("Speech"));

    expect(screen.getByText("whisper-large-v3")).toBeTruthy();
    expect(screen.getByText("canary-1b-flash")).toBeTruthy();
    expect(screen.queryByText("llama-4-scout-17b")).toBeNull();
    expect(screen.queryByText("mxbai-embed-large:latest")).toBeNull();
    // Section labels stay, counts follow the filter
    expect(screen.getByText("Online (1)")).toBeTruthy();
    expect(screen.getByText("Temporarily Down (1)")).toBeTruthy();
  });

  it("clicking the active chip again deselects it and restores all cards", () => {
    setModels(FIXTURE);
    renderHome();

    fireEvent.click(chip("Speech"));
    expect(screen.queryByText("llama-4-scout-17b")).toBeNull();

    fireEvent.click(chip("Speech"));

    expect(screen.getByText("llama-4-scout-17b")).toBeTruthy();
    expect(screen.getByText("Online (4)")).toBeTruthy();
    expect(chip("Speech").getAttribute("aria-checked")).toBe("false");
  });

  it("shows the category as a corner pill and hides it entirely for chat", () => {
    setModels(FIXTURE);
    renderHome();

    const speechCard = screen.getByLabelText("whisper-large-v3 — online");
    expect(within(speechCard).getByText("Speech")).toBeTruthy();

    const chatCard = screen.getByLabelText("qwen3-32b — online");
    expect(within(chatCard).queryByText("Chat")).toBeNull();
  });

  it("hides the filter when every model is in a single category", () => {
    setModels([
      m(1, "qwen3-32b", "chat", "online"),
      m(2, "qwen2.5-7b", "chat", "down"),
    ]);
    const { rerender } = renderHome();

    expect(
      screen.queryByLabelText("Filter models by category"),
    ).toBeNull();
    expect(screen.getByText("Online (1)")).toBeTruthy();

    // A second category arriving makes the filter appear again
    setModels([
      m(1, "qwen3-32b", "chat", "online"),
      m(2, "qwen2.5-7b", "chat", "down"),
      m(3, "whisper-large-v3", "speech", "online"),
    ]);
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(
      screen.getByLabelText("Filter models by category"),
    ).toBeTruthy();
  });

  it("archived-only categories get a chip; selecting retains the collapsed Archived section until expanded", () => {
    setModels(FIXTURE);
    renderHome();

    // Custom category shows its literal identifier
    const visionChip = chip("vision");
    expect(visionChip).toBeTruthy();

    fireEvent.click(visionChip);

    // Archived section retained but still collapsed
    expect(screen.getByText("Archived (1)")).toBeTruthy();
    expect(screen.queryByText("old-model")).toBeNull();

    // Expand the archived section
    fireEvent.click(screen.getByText("Archived (1)").parentElement as HTMLElement);
    expect(screen.getByText("old-model")).toBeTruthy();
  });

  it("models with missing or empty category appear under Chat", () => {
    setModels([
      m(1, "unclassified-model", undefined, "online"),
      m(2, "empty-category", "", "online"),
      m(3, "whisper-large-v3", "speech", "online"),
    ]);
    renderHome();

    const chatChip = chip("Chat");
    fireEvent.click(chatChip);
    expect(screen.getByText("unclassified-model")).toBeTruthy();
    expect(screen.getByText("empty-category")).toBeTruthy();
  });

  it("marks the selected chip with aria-checked; there is no All chip", () => {
    setModels(FIXTURE);
    renderHome();

    // No explicit "All" chip: nothing selected means all models shown
    expect(screen.queryByRole("radio", { name: "All" })).toBeNull();
    expect(chip("Speech").getAttribute("aria-checked")).toBe("false");

    fireEvent.click(chip("Speech"));
    expect(chip("Speech").getAttribute("aria-checked")).toBe("true");
    expect(chip("Chat").getAttribute("aria-checked")).toBe("false");
  });

  it("chips are keyboard-activatable native buttons", () => {
    // jsdom does not implement button activation behavior (Enter -> click),
    // so we assert the native semantics that guarantee it in browsers:
    // a real <button type="button"> that is enabled. (The toggle group
    // manages roving tabindex and arrow-key navigation itself.)
    setModels(FIXTURE);
    renderHome();

    const speech = chip("Speech");
    expect(speech.tagName).toBe("BUTTON");
    expect(speech.getAttribute("type")).toBe("button");
    expect((speech as HTMLButtonElement).disabled).toBe(false);

    // Click activation itself is covered by the other tests.
    fireEvent.click(speech);
    expect(screen.queryByText("llama-4-scout-17b")).toBeNull();
  });

  it("clears the selection when the selected category disappears on refresh", () => {
    setModels(FIXTURE);
    const { rerender } = renderHome();

    fireEvent.click(chip("Speech"));
    expect(screen.queryByText("llama-4-scout-17b")).toBeNull();

    // Poll returns data without any speech models. Embedding keeps the
    // filter visible so the reset itself is observable.
    setModels([
      m(1, "llama-4-scout-17b", "chat", "online"),
      m(4, "mxbai-embed-large:latest", "embedding", "online"),
    ]);
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    // Nothing selected -> everything shown, no chip checked
    const checked = screen
      .queryAllByRole("radio")
      .filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checked).toEqual([]);
    expect(screen.getByText("llama-4-scout-17b")).toBeTruthy();
  });

  it("does not resurrect a reset selection when its category reappears later", () => {
    setModels(FIXTURE);
    const { rerender } = renderHome();

    fireEvent.click(chip("Speech"));
    expect(chip("Speech").getAttribute("aria-checked")).toBe("true");

    // Poll returns data without any speech models -> selection clears.
    // Embedding keeps the filter visible across this refresh.
    setModels([
      m(1, "llama-4-scout-17b", "chat", "online"),
      m(4, "mxbai-embed-large:latest", "embedding", "online"),
    ]);
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    // The Speech chip is gone along with its category, and nothing is checked
    const checkedAfterReset = screen
      .queryAllByRole("radio")
      .filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checkedAfterReset).toEqual([]);

    // A later poll brings speech models back: the filter must stay off
    setModels([
      m(1, "llama-4-scout-17b", "chat", "online"),
      m(3, "whisper-large-v3", "speech", "online"),
    ]);
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(chip("Speech").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("llama-4-scout-17b")).toBeTruthy();
  });

  it("retains the selection across a refresh that still has the category", () => {
    setModels(FIXTURE);
    const { rerender } = renderHome();

    fireEvent.click(chip("Speech"));

    // Poll returns fresh data, speech models still present (whisper now down)
    setModels([
      m(3, "whisper-large-v3", "speech", "down"),
      m(1, "llama-4-scout-17b", "chat", "online"),
    ]);
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(chip("Speech").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("whisper-large-v3")).toBeTruthy();
    expect(screen.queryByText("llama-4-scout-17b")).toBeNull();
  });

  it("keeps empty and null model lists on the empty state", () => {
    setModels([]);
    const { rerender } = renderHome();
    expect(screen.getByText("No models found")).toBeTruthy();

    setModels(null);
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(screen.getByText("No models found")).toBeTruthy();
  });

  it("keeps loading and error screens unchanged", () => {
    hooks.isLoading = true;
    const { rerender } = renderHome();
    expect(screen.getByText("LLM Models")).toBeTruthy();
    expect(screen.queryByText("Online")).toBeNull();

    hooks.isLoading = false;
    hooks.isError = true;
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(screen.getByText("Failed to load models")).toBeTruthy();
  });
});
