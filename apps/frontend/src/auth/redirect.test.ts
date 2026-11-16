import { describe, expect, it } from "vitest";
import { safeRedirectTarget, withNext } from "./redirect";

const ORIGIN = "http://localhost:5173";
const target = (raw: string | null): string => safeRedirectTarget(raw, ORIGIN);

describe("safeRedirectTarget", () => {
  it("keeps a same-origin path with its query and hash", () => {
    expect(target("/history/AAPL?from=1&to=2#rows")).toBe("/history/AAPL?from=1&to=2#rows");
    expect(target("/chart/BRK.B?interval=5m")).toBe("/chart/BRK.B?interval=5m");
    expect(target("/")).toBe("/");
  });

  it("falls back to / when there is no target", () => {
    expect(target(null)).toBe("/");
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

  it("does not send the user back to the login or register page", () => {
    expect(target("/login")).toBe("/");
    expect(target("/register?next=/history")).toBe("/");
  });

  it("normalises dot segments without leaving the origin", () => {
    expect(target("/history/../chart")).toBe("/chart");
    expect(target("/../../evil.com")).toBe("/evil.com");
  });
});

describe("withNext", () => {
  it("adds the encoded target, or nothing for /", () => {
    expect(withNext("/login", "/")).toBe("/login");
    expect(withNext("/login", "/history/AAPL?from=1&to=2")).toBe("/login?next=%2Fhistory%2FAAPL%3Ffrom%3D1%26to%3D2");
  });

  it("round-trips through URLSearchParams and the validation", () => {
    const url = new URL(withNext("/login", "/chart/MSFT?interval=1h#x"), ORIGIN);
    expect(target(url.searchParams.get("next"))).toBe("/chart/MSFT?interval=1h#x");
  });
});
