import { createLogger } from "@stock-platform/logger";
import { describe, expect, it } from "vitest";
import { CleanupService, msUntilNextRun, type UserData } from "./cleanup.service.js";
import { KeycloakUnavailableError, KeycloakUsers } from "./keycloak-users.js";

const log = createLogger("test", { level: "silent" });

function fakeData(ids: string[]) {
  const deleted: string[] = [];
  const data: UserData = {
    listUserIds: async () => ids,
    deleteUser: async (id) => {
      deleted.push(id);
      return 1;
    },
  };
  return { data, deleted };
}

/** A Keycloak that knows `existing` and answers `failFor` with the given status. */
function fakeKeycloak(existing: string[], failFor: Record<string, number> = {}) {
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/token")) return Response.json({ access_token: "t" });
    const id = url.split("/").pop() ?? "";
    const status = failFor[id] ?? (existing.includes(id) ? 200 : 404);
    return new Response("{}", { status });
  };
  return new KeycloakUsers({ realmUrl: "http://kc/realms/stock-platform", clientId: "c", clientSecret: "s", fetchImpl });
}

function service(data: UserData, users: KeycloakUsers): CleanupService {
  return new CleanupService(data, users, log);
}

describe("CleanupService", () => {
  it("removes only users Keycloak answers 404 for", async () => {
    const { data, deleted } = fakeData(["a", "b", "c"]);
    const result = await service(data, fakeKeycloak(["a", "c"])).run();
    expect(result).toEqual({ checked: 3, removed: 1 });
    expect(deleted).toEqual(["b"]);
  });

  it("deletes nothing when one lookup fails", async () => {
    const { data, deleted } = fakeData(["a", "b", "c"]);
    await expect(service(data, fakeKeycloak(["a"], { c: 503 })).run()).rejects.toBeInstanceOf(KeycloakUnavailableError);
    expect(deleted).toEqual([]);
  });

  it("deletes nothing when Keycloak is unreachable", async () => {
    const { data, deleted } = fakeData(["a"]);
    const down = new KeycloakUsers({
      realmUrl: "http://kc/realms/stock-platform",
      clientId: "c",
      clientSecret: "s",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(service(data, down).run()).rejects.toBeInstanceOf(KeycloakUnavailableError);
    expect(deleted).toEqual([]);
  });

  it("treats a refused token as unavailable, not as deleted users", async () => {
    const { data, deleted } = fakeData(["a"]);
    const refused = new KeycloakUsers({
      realmUrl: "http://kc/realms/stock-platform",
      clientId: "c",
      clientSecret: "s",
      fetchImpl: async () => new Response("{}", { status: 401 }),
    });
    await expect(service(data, refused).run()).rejects.toBeInstanceOf(KeycloakUnavailableError);
    expect(deleted).toEqual([]);
  });
});

describe("msUntilNextRun", () => {
  it("is later today before the hour and tomorrow after it", () => {
    expect(msUntilNextRun(new Date("2026-11-25T01:30:00Z"), 3)).toBe(90 * 60_000);
    expect(msUntilNextRun(new Date("2026-11-25T03:00:00Z"), 3)).toBe(24 * 3_600_000);
  });
});
