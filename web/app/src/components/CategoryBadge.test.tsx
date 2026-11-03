import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategoryBadge } from "./CategoryBadge";

afterEach(cleanup);

describe("CategoryBadge", () => {
  it("renders the friendly label for known categories", () => {
    render(<CategoryBadge category="speech" />);
    expect(screen.getByText("Speech")).toBeTruthy();
  });

  it("renders raw identifiers for custom categories", () => {
    render(<CategoryBadge category="vision" />);
    expect(screen.getByText("vision")).toBeTruthy();
  });
});
