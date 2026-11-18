import { describe, expect, it } from "vitest";
import { bffLoginUrl, safeRedirectTarget } from "./redirect";

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

describe("bffLoginUrl", () => {
  it("adds the encoded returnTo, or nothing for /", () => {
    expect(bffLoginUrl("/")).toBe("/bff/login");
    expect(bffLoginUrl("/history/AAPL?from=1&to=2")).toBe("/bff/login?returnTo=%2Fhistory%2FAAPL%3Ffrom%3D1%26to%3D2");
  });

  it("asks for registration with prompt=create", () => {
    expect(bffLoginUrl("/", { register: true })).toBe("/bff/login?prompt=create");
    expect(bffLoginUrl("/chart/MSFT", { register: true })).toBe("/bff/login?returnTo=%2Fchart%2FMSFT&prompt=create");
  });

  it("round-trips through URLSearchParams", () => {
    const url = new URL(bffLoginUrl("/chart/MSFT?interval=1h#x"), ORIGIN);
    expect(url.searchParams.get("returnTo")).toBe("/chart/MSFT?interval=1h#x");
  });
});
