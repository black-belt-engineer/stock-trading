import type { Logger } from "@stock-platform/logger";
import type { UserDataRepository } from "../repositories/user-data.repository.js";
import type { KeycloakUsers } from "./keycloak-users.js";

/** How many users are looked up at once. */
const BATCH_SIZE = 10;

export type CleanupResult = { checked: number; removed: number };

/** What the cleanup needs from the data. */
export type UserData = Pick<UserDataRepository, "listUserIds" | "deleteUser">;

/**
 * The nightly safety net of K6: removes the rows of users Keycloak no longer has, which the
 * `identity.events` listener missed (broker down during a deletion, a message lost).
 *
 * Every user is checked first, and only then is anything deleted: one lookup that fails
 * (Keycloak down, `5xx`, the client refused) aborts the whole run with nothing deleted.
 * "Could not check" is never "deleted".
 */
export class CleanupService {
  constructor(
    private readonly data: UserData,
    private readonly users: KeycloakUsers,
    private readonly log: Logger,
  ) {}

  async run(): Promise<CleanupResult> {
    const ids = await this.data.listUserIds();
    if (ids.length === 0) {
      this.log.info({ checked: 0, removed: 0 }, "Cleanup: no users to check");
      return { checked: 0, removed: 0 };
    }
    const token = await this.users.token();
    const gone: string[] = [];
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      const batch = ids.slice(start, start + BATCH_SIZE);
      const found = await Promise.all(batch.map((id) => this.users.exists(id, token)));
      batch.forEach((id, index) => {
        if (found[index] === false) gone.push(id);
      });
    }
    for (const id of gone) {
      await this.data.deleteUser(id);
    }
    const result = { checked: ids.length, removed: gone.length };
    if (gone.length > 0) {
      // Each of these was missed by the Kafka listener: worth a look.
      this.log.warn({ ...result, userIds: gone }, "Cleanup removed data of users that no longer exist");
    } else {
      this.log.info(result, "Cleanup: every user still exists");
    }
    return result;
  }
}

/** Milliseconds from `now` until the next `hourUtc`:00 UTC (always in the future). */
export function msUntilNextRun(now: Date, hourUtc: number): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** Runs `task` every day at `hourUtc`:00 UTC. Returns a function that stops it. */
export function scheduleDaily(hourUtc: number, task: () => Promise<unknown>, log: Logger): () => void {
  let timer: NodeJS.Timeout | undefined;
  const arm = (): void => {
    timer = setTimeout(() => {
      task()
        .catch((err: unknown) => log.error({ err }, "Nightly cleanup failed; nothing was deleted"))
        .finally(arm);
    }, msUntilNextRun(new Date(), hourUtc));
    timer.unref();
  };
  arm();
  return () => clearTimeout(timer);
}
