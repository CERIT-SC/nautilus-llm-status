import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CategoryBadge } from "./CategoryBadge";

afterEach(cleanup);

describe("CategoryBadge", () => {
  it("renders a plain status dot for the default category (no label)", () => {
    const { container } = render(<CategoryBadge category="chat" status="online" />);
    expect(screen.queryByText("Chat")).toBeNull();
    expect(container.querySelector("span[title='online']")).toBeTruthy();
  });

  it("renders the label followed by the status dot for a real category", () => {
    render(<CategoryBadge category="speech" status="online" />);
    const label = screen.getByText("Speech");
    const dotHost = label.nextElementSibling as HTMLElement | null;
    expect(dotHost).toBeTruthy();
    expect(dotHost?.querySelector("span[title='online']")).toBeTruthy();
  });

  it("keeps the status color in the dot (down state)", () => {
    render(<CategoryBadge category="speech" status="down" />);
    expect(screen.getByText("Speech").nextElementSibling?.querySelector("span[title='down']")).toBeTruthy();
  });

  it("renders raw identifiers for custom categories", () => {
    render(<CategoryBadge category="vision" status="online" />);
    expect(screen.getByText("vision")).toBeTruthy();
  });
});
