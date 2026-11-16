import { describe, expect, it } from "vitest";
import { createEventStreamParser, type StreamEvent } from "./eventStream";

const encoder = new TextEncoder();

/** Feeds `chunks` (strings or raw bytes) and returns every dispatched event. */
function parse(chunks: Array<string | Uint8Array>, end = true): StreamEvent[] {
  const events: StreamEvent[] = [];
  const parser = createEventStreamParser((event) => events.push(event));
  for (const chunk of chunks) parser.push(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
  if (end) parser.end();
  return events;
}

/** Every possible split of `text` into two chunks at a byte offset. */
function everySplit(text: string): Array<[Uint8Array, Uint8Array]> {
  const bytes = encoder.encode(text);
  const out: Array<[Uint8Array, Uint8Array]> = [];
  for (let i = 0; i <= bytes.length; i += 1) out.push([bytes.slice(0, i), bytes.slice(i)]);
  return out;
}

describe("createEventStreamParser", () => {
  it("reads event, data and id fields and dispatches on a blank line", () => {
    expect(parse(["event: price\nid: 7\ndata: {\"a\":1}\n\n"])).toEqual([
      { type: "price", data: "{\"a\":1}", lastEventId: "7" },
    ]);
  });

  it("defaults the type to message and joins data lines with LF", () => {
    expect(parse(["data: one\ndata: two\n\n"])).toEqual([{ type: "message", data: "one\ntwo", lastEventId: "" }]);
  });

  it("ignores comment lines and unknown fields", () => {
    expect(parse([": heartbeat\n\nretry: 5\nfoo: bar\nevent: x\ndata: y\n\n"])).toEqual([
      { type: "x", data: "y", lastEventId: "" },
    ]);
  });

  it("dispatches an event with an empty data line but not one without any data line", () => {
    expect(parse(["event: session-expired\ndata:\n\n", "event: nothing\n\n"])).toEqual([
      { type: "session-expired", data: "", lastEventId: "" },
    ]);
  });

  it("drops only one leading space of a value and treats a field without a colon as empty", () => {
    expect(parse(["data:  two spaces\n\ndata\n\n"])).toEqual([
      { type: "message", data: " two spaces", lastEventId: "" },
      { type: "message", data: "", lastEventId: "" },
    ]);
  });

  it("keeps the last id across events", () => {
    const events = parse(["id: 1\ndata: a\n\ndata: b\n\n"]);
    expect(events.map((e) => e.lastEventId)).toEqual(["1", "1"]);
  });

  it("accepts CRLF and CR line endings", () => {
    expect(parse(["event: a\r\ndata: 1\r\n\r\nevent: b\rdata: 2\r\r"])).toEqual([
      { type: "a", data: "1", lastEventId: "" },
      { type: "b", data: "2", lastEventId: "" },
    ]);
  });

  it("does not count a CRLF split across chunks as two line breaks", () => {
    expect(parse(["data: 1\r", "\n\r", "\n"])).toEqual([{ type: "message", data: "1", lastEventId: "" }]);
  });

  it("gives the same events wherever a chunk splits a line", () => {
    const text = "event: price\ndata: {\"symbol\":\"AAPL\"}\n\nevent: snapshot\r\ndata: x\r\n\r\n";
    const expected = parse([text]);
    expect(expected).toHaveLength(2);
    for (const [a, b] of everySplit(text)) expect(parse([a, b])).toEqual(expected);
  });

  it("does not corrupt a multi-byte character split across chunks", () => {
    // "€" is three bytes and "😀" four; every split falls inside one of them at some point.
    const text = "data: {\"name\":\"Société €😀\"}\n\n";
    for (const [a, b] of everySplit(text)) {
      expect(parse([a, b])).toEqual([{ type: "message", data: "{\"name\":\"Société €😀\"}", lastEventId: "" }]);
    }
  });

  it("survives one byte at a time", () => {
    const bytes = encoder.encode("event: price\ndata: Zürich\n\n");
    const chunks = Array.from(bytes, (b) => Uint8Array.of(b));
    expect(parse(chunks)).toEqual([{ type: "price", data: "Zürich", lastEventId: "" }]);
  });

  it("drops an event that the body ends before its blank line", () => {
    expect(parse(["data: complete\n\ndata: cut off\n"])).toEqual([
      { type: "message", data: "complete", lastEventId: "" },
    ]);
  });
});
