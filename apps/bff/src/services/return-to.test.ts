import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to.js";

const ORIGIN = "http://localhost:5173";
const target = (raw: string | null | undefined): string => safeReturnTo(raw, ORIGIN);

describe("safeReturnTo", () => {
  it("keeps a same-origin path with its query and hash", () => {
    expect(target("/history/AAPL?from=1&to=2#rows")).toBe("/history/AAPL?from=1&to=2#rows");
    expect(target("/chart/BRK.B?interval=5m")).toBe("/chart/BRK.B?interval=5m");
    expect(target("/")).toBe("/");
  });

  it("falls back to / when there is no target", () => {
    expect(target(null)).toBe("/");
    expect(target(undefined)).toBe("/");
    expect(target("")).toBe("/");
  });

  it.each([
    "//evil.com",
    "//evil.com/path",
    "https://evil.com",
    "http://localhost:5173/history", // absolute, even to this origin: not a path
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " /history",
    "history",
    "/\t/evil.com",
    "/\n/evil.com",
    "/foo\\..\\..\\evil",
    "data:text/html,hi",
  ])("rejects %j", (raw) => {
    expect(target(raw)).toBe("/");
  });

  it("does not send the user back to the login, register or BFF routes", () => {
    expect(target("/login")).toBe("/");
    expect(target("/register?next=/history")).toBe("/");
    expect(target("/bff/login")).toBe("/");
    expect(target("/bff/callback?code=x")).toBe("/");
    expect(target("/bffx")).toBe("/bffx");
  });

  it("normalises dot segments without leaving the origin", () => {
    expect(target("/history/../chart")).toBe("/chart");
    expect(target("/../../evil.com")).toBe("/evil.com");
    expect(target("/history/../bff/login")).toBe("/");
  });
});
