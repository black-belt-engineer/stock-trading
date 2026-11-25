import { describe, expect, it } from "vitest";
import { matchKey, neighbourIndex } from "./shortcuts";
import type { Box, KeyPress } from "./shortcuts";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe("matchKey", () => {
  it("matches single keys by the produced character", () => {
    expect(matchKey(press("/"), null, true)).toEqual({ kind: "action", action: "focusSearch", key: "/" });
    expect(matchKey(press("?"), null, true)).toEqual({ kind: "action", action: "help", key: "?" });
    expect(matchKey(press("p"), null, true)).toEqual({ kind: "action", action: "togglePause", key: "p" });
  });

  it("arms a sequence on its first key and completes it on the second", () => {
    expect(matchKey(press("g"), null, true)).toEqual({ kind: "pending", prefix: "g" });
    expect(matchKey(press("h"), "g", true)).toEqual({ kind: "action", action: "goHistory", key: "h" });
  });

  it("matches a key that does not complete the sequence on its own", () => {
    expect(matchKey(press("p"), "g", true)).toEqual({ kind: "action", action: "togglePause", key: "p" });
    expect(matchKey(press("x"), "g", true)).toEqual({ kind: "none" });
  });

  it("ignores every key with Ctrl, Alt or Meta held", () => {
    expect(matchKey(press("/", { ctrlKey: true }), null, true).kind).toBe("none");
    expect(matchKey(press("p", { altKey: true }), null, true).kind).toBe("none");
    expect(matchKey(press("v", { metaKey: true }), null, true).kind).toBe("none");
  });

  it("drops character keys when they are turned off, keeping arrows and Escape", () => {
    expect(matchKey(press("/"), null, false).kind).toBe("none");
    expect(matchKey(press("g"), null, false).kind).toBe("none");
    expect(matchKey(press("q"), "g", false).kind).toBe("none");
    expect(matchKey(press("Escape"), null, false)).toEqual({ kind: "action", action: "escape", key: "Escape" });
    expect(matchKey(press("ArrowDown"), null, false)).toEqual({ kind: "action", action: "moveFocus", key: "ArrowDown" });
  });

  it("leaves Enter to the focused button", () => {
    expect(matchKey(press("Enter"), null, true).kind).toBe("none");
  });

  it("is case-sensitive, so Shift+P is not p", () => {
    expect(matchKey(press("P"), null, true).kind).toBe("none");
  });
});

describe("neighbourIndex", () => {
  // Three columns, two rows; the second row has two cards.
  const grid: Box[] = [
    { left: 0, top: 0, width: 100, height: 80 },
    { left: 110, top: 0, width: 100, height: 80 },
    { left: 220, top: 0, width: 100, height: 80 },
    { left: 0, top: 90, width: 100, height: 80 },
    { left: 110, top: 90, width: 100, height: 80 },
  ];

  it("moves within a row", () => {
    expect(neighbourIndex(grid, 0, "right")).toBe(1);
    expect(neighbourIndex(grid, 2, "left")).toBe(1);
    expect(neighbourIndex(grid, 2, "right")).toBe(-1);
  });

  it("moves to the closest card in the next row", () => {
    expect(neighbourIndex(grid, 1, "down")).toBe(4);
    expect(neighbourIndex(grid, 4, "up")).toBe(1);
    expect(neighbourIndex(grid, 2, "down")).toBe(4);
    expect(neighbourIndex(grid, 0, "up")).toBe(-1);
  });

  it("walks table rows up and down, and not sideways", () => {
    const rows: Box[] = [0, 1, 2].map((i) => ({ left: 0, top: i * 36, width: 600, height: 36 }));
    expect(neighbourIndex(rows, 0, "down")).toBe(1);
    expect(neighbourIndex(rows, 2, "up")).toBe(1);
    expect(neighbourIndex(rows, 1, "right")).toBe(-1);
  });
});
