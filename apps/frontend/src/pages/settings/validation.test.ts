import { describe, expect, it } from "vitest";
import { checkConfirmation, checkCurrentPassword, checkEmail, checkName, checkNewPassword } from "./validation";

describe("settings validation", () => {
  it("checks the name like the server, after trimming", () => {
    expect(checkName("Ada")).toBeNull();
    expect(checkName("   ")).toBe("Enter your name");
    expect(checkName("a".repeat(100))).toBeNull();
    expect(checkName("a".repeat(101))).not.toBeNull();
  });

  it("checks the email format and length", () => {
    expect(checkEmail("ada@example.com")).toBeNull();
    expect(checkEmail(" Ada@Example.COM ")).toBeNull();
    for (const bad of ["", "ada", "ada@", "@example.com", "ada@example", "ada@@example.com", "ada @example.com"]) {
      expect(checkEmail(bad)).not.toBeNull();
    }
    expect(checkEmail(`${"a".repeat(64)}@${"b".repeat(185)}.com`)).toBeNull(); // 254 characters
    expect(checkEmail(`${"a".repeat(64)}@${"b".repeat(186)}.com`)).not.toBeNull(); // 255 characters
  });

  it("checks password lengths and the confirmation", () => {
    expect(checkNewPassword("1234567")).not.toBeNull();
    expect(checkNewPassword("12345678")).toBeNull();
    expect(checkNewPassword("x".repeat(129))).not.toBeNull();
    expect(checkCurrentPassword("")).not.toBeNull();
    expect(checkCurrentPassword("x")).toBeNull();
    expect(checkConfirmation("abcdefgh", "")).toBe("Repeat the new password");
    expect(checkConfirmation("abcdefgh", "abcdefgH")).toBe("The passwords do not match");
    expect(checkConfirmation("abcdefgh", "abcdefgh")).toBeNull();
  });
});
