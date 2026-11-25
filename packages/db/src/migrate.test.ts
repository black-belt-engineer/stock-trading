import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checksumOf, MigrationError, planMigrations, readMigrations, type Migration } from "./migrate.js";

function migration(name: string, sql = `-- ${name}`): Migration {
  return { name, sql, checksum: checksumOf(sql) };
}

describe("planMigrations", () => {
  const files = [migration("0001_a.sql"), migration("0002_b.sql"), migration("0003_c.sql")];

  it("returns everything on an empty database", () => {
    expect(planMigrations(files, []).map((m) => m.name)).toEqual(["0001_a.sql", "0002_b.sql", "0003_c.sql"]);
  });

  it("returns only what has not run", () => {
    const applied = files.slice(0, 2).map(({ name, checksum }) => ({ name, checksum }));
    expect(planMigrations(files, applied).map((m) => m.name)).toEqual(["0003_c.sql"]);
  });

  it("returns nothing when up to date", () => {
    expect(planMigrations(files, files.map(({ name, checksum }) => ({ name, checksum })))).toEqual([]);
  });

  it("refuses a migration the code does not have", () => {
    expect(() => planMigrations(files.slice(0, 1), [{ name: "0002_b.sql", checksum: "x" }])).toThrow(MigrationError);
  });

  it("refuses a migration that was edited after it ran", () => {
    expect(() => planMigrations(files, [{ name: "0001_a.sql", checksum: checksumOf("something else") }])).toThrow(
      /changed after it ran/,
    );
  });

  it("refuses a new migration numbered before one that ran", () => {
    const applied = [files[0], files[2]].flatMap((m) => (m ? [{ name: m.name, checksum: m.checksum }] : []));
    expect(() => planMigrations(files, applied)).toThrow(/0002_b.sql is older than 0003_c.sql/);
  });
});

describe("readMigrations", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function folder(files: Record<string, string>): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "migrations-"));
    for (const [name, sql] of Object.entries(files)) {
      await writeFile(join(dir, name), sql);
    }
    return dir;
  }

  it("reads .sql files in name order with their checksums, ignoring other files", async () => {
    const path = await folder({ "0002_b.sql": "SELECT 2;", "0001_a.sql": "SELECT 1;", "README.md": "notes" });
    const read = await readMigrations(path);
    expect(read.map((m) => m.name)).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(read[0]?.checksum).toBe(checksumOf("SELECT 1;"));
  });

  it("refuses a badly named .sql file", async () => {
    const path = await folder({ "1_a.sql": "SELECT 1;" });
    await expect(readMigrations(path)).rejects.toThrow(/does not match/);
  });

  it("refuses two files with the same number", async () => {
    const path = await folder({ "0001_a.sql": "SELECT 1;", "0001_b.sql": "SELECT 2;" });
    await expect(readMigrations(path)).rejects.toThrow(/Two migrations are numbered 0001/);
  });
});
