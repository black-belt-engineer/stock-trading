import { describe, expect, it } from "vitest";
import { parseIdentityEvent } from "./identity-event.js";

const ID = "876fa7db-9db6-4027-b24e-dc5d4d9e5600";

describe("parseIdentityEvent", () => {
  it("reads the listener's message", () => {
    expect(parseIdentityEvent(`{"type":"user.deleted","userId":"${ID.toUpperCase()}","occurredAt":5,"source":"admin"}`)).toEqual({
      type: "user.deleted",
      userId: ID,
      occurredAt: 5,
      source: "admin",
    });
  });

  it("ignores other types and malformed messages", () => {
    expect(parseIdentityEvent(`{"type":"user.registered","userId":"${ID}"}`)).toBeNull();
    expect(parseIdentityEvent(`{"type":"user.deleted","userId":"not-a-uuid"}`)).toBeNull();
    expect(parseIdentityEvent("not json")).toBeNull();
    expect(parseIdentityEvent("null")).toBeNull();
  });
});
