/**
 * A parser for the `text/event-stream` format, for reading a `fetch` response body.
 * `EventSource` cannot send an `Authorization` header (README Q1), so the stream is
 * read by hand.
 *
 * Follows the WHATWG "interpreting an event stream" rules that matter here:
 * lines end in LF, CRLF or CR; a blank line dispatches the event; a line starting
 * with `:` is a comment; a field without a colon has an empty value; one space after
 * the colon is dropped; `event`, `data` and `id` are read and other fields ignored.
 * An event is dispatched only when it had at least one `data` line, so
 * `event: x\ndata:\n\n` is an event with empty data but `event: x\n\n` is nothing.
 */

export type StreamEvent = {
  /** `message` when the event had no `event:` field. */
  type: string;
  /** The `data` lines joined with `\n`. */
  data: string;
  /** The last `id` seen on the stream so far (it carries over between events), or "" for none. */
  lastEventId: string;
};

export type EventStreamParser = {
  /** Feeds bytes from the body. A chunk may end anywhere, even inside a character. */
  push: (bytes: Uint8Array) => void;
  /** Call when the body ends. An event without its closing blank line is dropped, as the spec says. */
  end: () => void;
};

export function createEventStreamParser(onEvent: (event: StreamEvent) => void): EventStreamParser {
  // `stream: true` holds back the bytes of a character split across chunks.
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  // A chunk that ended in CR: an LF at the start of the next one belongs to the same line break.
  let skipLeadingLf = false;
  let eventType = "";
  let dataLines: string[] = [];
  let lastEventId = "";

  const dispatch = (): void => {
    if (dataLines.length > 0) {
      onEvent({ type: eventType === "" ? "message" : eventType, data: dataLines.join("\n"), lastEventId });
    }
    eventType = "";
    dataLines = [];
  };

  const processLine = (line: string): void => {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        eventType = value;
        break;
      case "data":
        dataLines.push(value);
        break;
      case "id":
        if (!value.includes("\u0000")) lastEventId = value;
        break;
      default:
        break;
    }
  };

  const consume = (text: string): void => {
    if (text === "") return;
    let input = text;
    if (skipLeadingLf) {
      skipLeadingLf = false;
      if (input.startsWith("\n")) input = input.slice(1);
    }
    buffer += input;
    let start = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const ch = buffer[i];
      if (ch !== "\n" && ch !== "\r") continue;
      processLine(buffer.slice(start, i));
      if (ch === "\r") {
        if (i + 1 < buffer.length) {
          if (buffer[i + 1] === "\n") i += 1;
        } else {
          skipLeadingLf = true;
        }
      }
      start = i + 1;
    }
    buffer = buffer.slice(start);
  };

  return {
    push: (bytes) => consume(decoder.decode(bytes, { stream: true })),
    end: () => {
      consume(decoder.decode());
      buffer = "";
      eventType = "";
      dataLines = [];
    },
  };
}
