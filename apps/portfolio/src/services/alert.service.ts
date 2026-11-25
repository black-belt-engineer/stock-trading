import { ConflictError, NotFoundError, ValidationError } from "@stock-platform/errors";
import {
  ACTIVE_ALERT_LIMIT,
  ALERT_HISTORY_LIMIT,
  centsOf,
  conditionMet,
  formatCents,
  type Alert,
  type AlertDirection,
  type AlertsResponse,
  type TriggerResponse,
} from "../models/alert.js";
import { isListed, resolveSymbol } from "../models/symbols.js";
import type { AlertRepository, AlertRow } from "../repositories/alert.repository.js";

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    threshold: row.threshold,
    createdAt: row.createdAt.toISOString(),
    triggeredAt: row.triggeredAt?.toISOString() ?? null,
    triggeredPrice: row.triggeredPrice,
    listed: isListed(row.symbol),
  };
}

/** A positive amount in cents, or 400. The route's schema has already checked the pattern. */
function positiveCents(amount: string, field: string): number {
  const cents = centsOf(amount);
  if (cents === null || cents <= 0) {
    throw new ValidationError(`${field} must be a positive amount with at most two decimals`);
  }
  return cents;
}

/** P2. The user is always the token's subject. Alerts are evaluated by the browser (Q7). */
export class AlertService {
  constructor(private readonly repository: AlertRepository) {}

  async list(userId: string): Promise<AlertsResponse> {
    const { active, history } = await this.repository.list(userId, ALERT_HISTORY_LIMIT);
    return { active: active.map(toAlert), history: history.map(toAlert) };
  }

  /**
   * `400` malformed symbol or amount, `404` unknown symbol, `409` with {@link ACTIVE_ALERT_LIMIT}
   * active alerts. A threshold the price is already past is allowed: the client warns and asks
   * first, and the alert then fires on the next quote.
   */
  async create(
    userId: string,
    input: { symbol: string; direction: AlertDirection; threshold: string },
  ): Promise<Alert> {
    const { symbol } = resolveSymbol(input.symbol);
    const threshold = formatCents(positiveCents(input.threshold, "threshold"));
    const result = await this.repository.create(userId, { symbol, direction: input.direction, threshold }, ACTIVE_ALERT_LIMIT);
    if (!result.ok) {
      throw new ConflictError(`You already have ${ACTIVE_ALERT_LIMIT} active alerts`);
    }
    return toAlert(result.alert);
  }

  /** Idempotent. Removes an active alert or a history entry. */
  async remove(userId: string, id: string): Promise<void> {
    await this.repository.remove(userId, id);
  }

  /**
   * Called by a browser that saw `price` meet the alert. `first` tells it whether to notify:
   * only the call that actually set `triggeredAt` does. `404` when the alert is gone; `400` when
   * `price` does not meet the condition, so history never shows a price that could not fire it.
   */
  async trigger(userId: string, id: string, price: string): Promise<TriggerResponse> {
    const priceCents = positiveCents(price, "price");
    const current = await this.repository.find(userId, id);
    if (!current) throw new NotFoundError("Alert not found");
    const thresholdCents = centsOf(current.threshold);
    if (thresholdCents === null || !conditionMet(current.direction, thresholdCents, priceCents)) {
      throw new ValidationError(`${price} does not meet the alert (${current.direction} ${current.threshold})`);
    }
    const result = await this.repository.trigger(userId, id, formatCents(priceCents));
    if (!result) throw new NotFoundError("Alert not found");
    return { first: result.first, alert: toAlert(result.alert) };
  }
}
