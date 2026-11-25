import { apiFetch, LoggedOutError } from "../api";
import type { ApiFetch } from "../api/client";
import { isRecord } from "../utils/guards";

export type AlertDirection = "above" | "below";

/** One price alert (P2). Amounts are the server's decimal strings ("228.50"), never floats. */
export type PriceAlert = {
  id: string;
  symbol: string;
  direction: AlertDirection;
  threshold: string;
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms once triggered, else `null`. */
  triggeredAt: number | null;
  triggeredPrice: string | null;
  /** False once the symbol has left the registry: it gets no quotes, so it cannot fire. */
  listed: boolean;
};

export type AlertLists = { active: PriceAlert[]; history: PriceAlert[] };

export type NewAlert = { symbol: string; direction: AlertDirection; threshold: string };

/**
 * How a create ended. `full`: 50 active alerts (409). `invalid`: the server refused the values
 * (400) or the symbol (404). `loggedOut`: the route guard takes over. `failed`: anything else.
 */
export type CreateResult =
  | { ok: true; alert: PriceAlert }
  | { ok: false; reason: "full" | "invalid" | "loggedOut" | "failed"; message: string };

/**
 * How a trigger call ended. `confirmed`: the server set `triggeredAt`; `first` says whether this
 * call was the one (only then does this tab notify). `gone`: deleted meanwhile (404), ignored
 * silently. `refused`: 400, the price does not meet the alert (it changed since it was loaded).
 */
export type TriggerResult =
  | { kind: "confirmed"; first: boolean; alert: PriceAlert }
  | { kind: "gone" | "refused" | "loggedOut" | "failed" };

export type RemoveResult = "ok" | "loggedOut" | "failed";

export type AlertsApi = {
  /** Throws when the list cannot be loaded. */
  load: () => Promise<AlertLists>;
  create: (alert: NewAlert) => Promise<CreateResult>;
  remove: (id: string) => Promise<RemoveResult>;
  trigger: (id: string, price: string) => Promise<TriggerResult>;
};

function timeOrNull(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function parseAlert(value: unknown): PriceAlert | null {
  if (!isRecord(value)) return null;
  const { id, symbol, direction, threshold } = value;
  const createdAt = timeOrNull(value.createdAt);
  if (
    typeof id !== "string" ||
    typeof symbol !== "string" ||
    (direction !== "above" && direction !== "below") ||
    typeof threshold !== "string" ||
    createdAt === null
  ) {
    return null;
  }
  return {
    id,
    symbol,
    direction,
    threshold,
    createdAt,
    triggeredAt: timeOrNull(value.triggeredAt),
    triggeredPrice: typeof value.triggeredPrice === "string" ? value.triggeredPrice : null,
    listed: value.listed !== false,
  };
}

function parseList(value: unknown): PriceAlert[] {
  if (!Array.isArray(value)) throw new Error("Malformed alerts response");
  return value.map(parseAlert).filter((alert): alert is PriceAlert => alert !== null);
}

/** The `GET /portfolio/alerts` body; malformed entries are dropped, a malformed body throws. */
export function parseAlertLists(body: unknown): AlertLists {
  if (!isRecord(body)) throw new Error("Malformed alerts response");
  return { active: parseList(body.active), history: parseList(body.history) };
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === "string" && body.error !== "") return body.error;
  } catch {
    // Not JSON: use the fallback.
  }
  return fallback;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** The portfolio service's alert endpoints, through the BFF (P2). */
export function createAlertsApi(fetchImpl: ApiFetch = apiFetch): AlertsApi {
  return {
    load: async () => {
      const response = await fetchImpl("/portfolio/alerts");
      if (!response.ok) throw new Error(`Alerts request failed: ${response.status}`);
      return parseAlertLists(await response.json());
    },

    create: async (alert) => {
      try {
        const response = await fetchImpl("/portfolio/alerts", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(alert),
        });
        if (response.status === 201) {
          const created = parseAlert(await response.json());
          if (created) return { ok: true, alert: created };
          return { ok: false, reason: "failed", message: "Unexpected answer from the server" };
        }
        if (response.status === 409) {
          return { ok: false, reason: "full", message: await errorMessage(response, "Too many active alerts") };
        }
        if (response.status === 400 || response.status === 404) {
          return { ok: false, reason: "invalid", message: await errorMessage(response, "The alert was refused") };
        }
        return { ok: false, reason: "failed", message: "Service unavailable, try again" };
      } catch (error) {
        if (error instanceof LoggedOutError) return { ok: false, reason: "loggedOut", message: "Logged out" };
        return { ok: false, reason: "failed", message: "Service unavailable, try again" };
      }
    },

    remove: async (id) => {
      try {
        const response = await fetchImpl(`/portfolio/alerts/${encodeURIComponent(id)}`, { method: "DELETE" });
        return response.ok ? "ok" : "failed";
      } catch (error) {
        return error instanceof LoggedOutError ? "loggedOut" : "failed";
      }
    },

    trigger: async (id, price) => {
      try {
        const response = await fetchImpl(`/portfolio/alerts/${encodeURIComponent(id)}/trigger`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ price }),
        });
        if (response.status === 404) return { kind: "gone" };
        if (response.status === 400) return { kind: "refused" };
        if (!response.ok) return { kind: "failed" };
        const body: unknown = await response.json();
        const alert = isRecord(body) ? parseAlert(body.alert) : null;
        if (!isRecord(body) || typeof body.first !== "boolean" || alert === null) return { kind: "failed" };
        return { kind: "confirmed", first: body.first, alert };
      } catch (error) {
        return error instanceof LoggedOutError ? { kind: "loggedOut" } : { kind: "failed" };
      }
    },
  };
}
