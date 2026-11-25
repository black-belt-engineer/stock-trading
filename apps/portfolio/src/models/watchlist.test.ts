import { describe, expect, it } from "vitest";
import { duplicatesIn, mergeOrder } from "./watchlist.js";

describe("mergeOrder", () => {
  it("takes a full permutation as the new order", () => {
    expect(mergeOrder(["AAPL", "MSFT", "TSLA"], ["TSLA", "AAPL", "MSFT"])).toEqual({
      ok: true,
      order: ["TSLA", "AAPL", "MSFT"],
    });
  });

  it("keeps symbols the request left out after the named ones, in their old order", () => {
    // Another device added KO and V after this client loaded the list.
    expect(mergeOrder(["AAPL", "KO", "MSFT", "V"], ["MSFT", "AAPL"])).toEqual({
      ok: true,
      order: ["MSFT", "AAPL", "KO", "V"],
    });
  });

  it("rejects symbols that are not on the list", () => {
    expect(mergeOrder(["AAPL"], ["AAPL", "TSLA", "KO"])).toEqual({ ok: false, unknown: ["TSLA", "KO"] });
  });

  it("accepts an empty request and an empty list", () => {
    expect(mergeOrder([], [])).toEqual({ ok: true, order: [] });
    expect(mergeOrder(["AAPL"], [])).toEqual({ ok: true, order: ["AAPL"] });
  });
});

describe("duplicatesIn", () => {
  it("names each repeated symbol once", () => {
    expect(duplicatesIn(["AAPL", "KO", "AAPL", "AAPL", "KO", "V"])).toEqual(["AAPL", "KO"]);
    expect(duplicatesIn(["AAPL", "KO"])).toEqual([]);
  });
});
