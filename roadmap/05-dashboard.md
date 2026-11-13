# 05 · Dashboard features

Small frontend-only features with no backend work and no dependencies beyond the UI groundwork. Good candidates to pull forward whenever a short task is wanted.

---

## D1 · Search and sort — score 65

**Problem.** The grid shows symbols in server order with no way to find or order them. This matters as soon as M1 adds more symbols.

**Plan.**

1. Search input above the grid; filter by symbol prefix first, then by substring of the company name. Case-insensitive.
2. Sort control: symbol A–Z, price, day change (high to low and low to high), volume.
3. Combine with the sector filter: filter, then search, then sort, in one `useMemo`.
4. Keep search, sort and filter in the URL query string so a view is shareable and survives reload.
5. Empty result: "No symbols match 'xyz'" with a Clear button.

**Edge cases.**

- Sorting by a live value reorders cards every second, which makes them impossible to click. Re-sort on a slow interval (every five seconds), or freeze the order while the pointer is over the grid.
- Ties: fall back to symbol so the order is deterministic.
- Until M2, "change" is tick-to-tick noise; offer that sort only after M2.
- Leading and trailing spaces in the query; symbols with dots (`BRK.B`).
- The symbol whose detail dialog is open gets filtered out: keep the dialog open, it is driven by the URL, not by the filtered list.
- React keys must stay the symbol so cards keep their state when reordered.

**Future issues.**

- With thousands of symbols, search moves to the server and the grid needs virtualisation.
- Fuzzy matching ("micro" → MSFT) is a natural follow-up; keep the matching function isolated so it can be swapped.

**Done when.** Typing "ms" shows Microsoft, sort by price orders correctly, and reloading the page preserves both.

---

## D2 · Feed controls — score 58

**Problem.** The Live Feed is a fixed list of 20 rows that cannot be paused or filtered. The trade `quantity` is sent by the server and never displayed.

**Plan.** *(Do B2 first.)*

1. Pause/Resume button. While paused, incoming trades go to a buffer and a "12 new" badge shows the count.
2. Filter: all symbols, or only the symbol whose dialog is open, or a chosen symbol.
3. Show quantity in each row (for example `120 @ $228.50`).
4. Pause automatically while the pointer is over the list, so rows do not move under the cursor.
5. Move the row cap from the hook (`slice(0, 20)` in `usePriceStream.ts:73`) to the component and raise it to about 100, with the list scrolling inside its panel.

**Edge cases.**

- A long pause must not grow memory without bound: cap the buffer (for example 500) and show "500+".
- Resume: merge buffered rows in time order, then apply the cap.
- A filter with no matching trades: "No trades for TSLA yet".
- Row keys currently include `Math.random()`; with S1's event ids available, use those instead.
- The feed timestamp uses the browser locale while prices use `en-US`; pick one convention.
- Under reduced motion, drop the row slide-in animation.

**Future issues.**

- A real feed produces far more trades than a person can read; the feed then needs sampling or a minimum trade size filter.
- A second kind of row (alert fired, order filled) will want to share this panel; give rows a `type` now.

**Done when.** Pausing stops the list and counts new trades, resuming shows them, and the filter restricts rows to one symbol.

---

## D3 · Table view toggle — score 52

**Problem.** Cards are comfortable for six symbols and wasteful for thirty.

**Plan.** *(Needs U1. Better after M2.)*

1. A cards/table toggle beside the filters.
2. Table columns: symbol, name, last, day change, day %, day high, day low, volume, mini sparkline. Right-align numbers.
3. Clicking a column header sorts, sharing state with D1's sort control.
4. Rows are keyboard-focusable and open the same detail dialog.
5. Remember the choice per browser in `localStorage` (a display preference, not personal data, so it does not conflict with the server-side decision).
6. Sticky header row; on narrow screens hide the low-priority columns (name, high, low).

**Edge cases.**

- The price flash must not change cell width; use a fixed-width numeric font and background-only flashes.
- Sortable headers need `aria-sort` and must be real buttons.
- Table as the default on phones (see U2) while the stored preference says cards: an explicit stored choice wins.
- Thirty live sparklines in a table re-render every second; memoise rows on their own data (B1 makes this possible).
- `localStorage` can be unavailable (private mode); fall back to the default silently.

**Future issues.**

- Column chooser and per-user saved layouts would move this preference server-side.
- Beyond a few hundred rows the table needs virtualisation.

**Done when.** The toggle switches views without losing filter, search or sort, and the choice survives a reload.

---

## D4 · Light theme — score 56

**Problem.** Only a dark theme exists. The tokens are centralised in `tokens.css`, so a second theme is mostly a second set of values.

**Plan.** *(Needs U1 complete; every colour must come from a token.)*

1. Define a light value for every token under a `[data-theme="light"]` selector on the root element.
2. Default to the operating-system preference; a three-way control (System, Light, Dark) in Settings and the sidebar overrides it. Store the choice in `localStorage`.
3. Set the theme attribute with a tiny inline script in `index.html` before the app loads, to avoid a flash of the wrong theme.
4. Replace remaining hard-coded colours: the badge backgrounds in `PriceCard` (`rgba(34,197,94,0.15)`), the dialog overlay and shadows, `--card-shadow`.
5. Update the `theme-color` meta tag with the theme.

**Edge cases.**

- The lime accent (`#e2f73f`) is unreadable as text on white. The light theme needs a darker brand colour for text and borders, keeping lime for fills only.
- Green and red also need darker values on white to reach 4.5:1 as text.
- The system preference can change while the app is open (automatic night mode); listen for it when the setting is "System".
- Sparkline fill opacity (0.08) disappears on white; make opacity a token.
- The favicon is a single SVG; check that it is visible on both light and dark browser chrome.

**Future issues.**

- Every new component now needs checking in two themes; charts (M4) are the most work because grid lines, axes and candles all need themed values.
- If preferences move server-side (A4), the inline script still needs the `localStorage` copy to avoid the flash before the user is known.

**Done when.** Switching themes changes every surface with no leftover dark patches, all text passes contrast in both, and there is no flash on reload.

---

## D5 · Keyboard shortcuts — score 49

**Problem.** A market dashboard is a keyboard-heavy tool and there are no shortcuts.

**Plan.** *(Needs U3's focusable cards; `/` needs D1.)*

1. `/` focuses search. `Esc` clears search, or closes the dialog if one is open.
2. Arrow keys move focus between cards or table rows; `Enter` opens the detail dialog.
3. `g` then `q`, `c`, `h`, `s` navigates to Quotes, Chart, History, Settings.
4. `p` pauses or resumes the feed (D2). `v` toggles card/table view (D3).
5. `?` opens a help dialog listing the shortcuts.
6. One central handler with a declarative map, so the help dialog is generated from the same data.

**Edge cases.**

- Ignore shortcuts while typing in an input, textarea or editable element, and whenever Ctrl, Alt or Meta is held, so browser shortcuts keep working.
- While a dialog is open, only `Esc` applies; Radix traps focus and handles `Esc` already, so avoid double handling.
- Arrow navigation in a responsive grid: the number of columns changes with width; compute neighbours from element positions, not from a fixed column count.
- `/` and `?` sit on different keys across keyboard layouts; match on the produced character, not the physical key.
- Screen-reader users rely on single-key commands of their own; provide a setting to turn single-key shortcuts off (a WCAG requirement for character-key shortcuts).
- Two-key sequences need a timeout (about one second) so a stray `g` does not arm navigation indefinitely.

**Future issues.**

- A command palette (Ctrl+K) is the natural successor and can reuse the same action map.
- Trading shortcuts (P3: buy, sell) need confirmation steps; a single key press must never place an order.

**Done when.** The dashboard can be searched, navigated and opened without touching the mouse, and `?` documents every shortcut.
