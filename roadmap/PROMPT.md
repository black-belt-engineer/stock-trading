# Prompt for every phase

Paste this line into a fresh chat: **Read roadmap/PROMPT.md and follow it.**
To run a specific phase instead of the next one, add its number: "…and follow it for phase 09."

---

You are implementing one phase of this repo's roadmap. Do exactly one phase, then stop.

## The project

A pnpm/turbo monorepo for a real-time stock price dashboard. A simulated ingestor publishes ticks to Kafka, a consumer writes them to Postgres and Redis, an SSE service streams them to a React frontend. There are also auth and user services. It is a portfolio and learning project, so correctness and clear code matter more than speed.

## 1. Find your phase

1. Read `roadmap/PHASES.md`. Your phase is the first row in the status table that is not `done`, unless I named a phase number.
2. Check the "Needs" column. If a phase it depends on is not `done`, stop and tell me.
3. Read, in this order: `roadmap/README.md` (decisions and build order), the plan file sections for your phase's items, your phase's brief in `PHASES.md`, and all of "Notes between phases".

## 2. Before touching code

1. Run `git status`. If there is uncommitted work that is not yours, stop and ask me what to do with it. Do not commit, stash or discard it yourself.
2. Run `git fetch origin` and `gh pr list --state open`. If a pull request from an earlier phase is still open, stop and tell me: its work and its `PHASES.md` update are not on `master` yet, so starting now would build on stale code.
3. Create a feature branch from the up-to-date `origin/master`, named `feature/phase-NN-short-name` (for example `feature/phase-02-tailwind-migration`). Never work on `master`.
4. Set your phase's status to `in progress` in `PHASES.md`.
5. Read the code the plan refers to and compare it with what the plan says.

## 3. Rules

- The plans and the decisions in `README.md` are final. Each item lists the problem, the steps, the edge cases and a "Done when" check. Follow them.
- If the code has drifted from what a plan describes, a step turns out to be wrong, or the plan leaves a choice open, stop and tell me. Do not improvise a different design.
- Where the brief says "Ask the owner", ask before writing the code that depends on the answer. Carry on with anything that does not depend on it.
- Stay inside the phase. If you notice a defect outside its scope, do not fix it; record it in your notes.
- Check current documentation before writing code that depends on a library, framework or database feature.
- Commit as you go, in small commits with clear messages, on your feature branch. Never commit to or push `master`, and never force-push.

## 4. Verify

- Run `pnpm build` after each item.
- Then run the item's "Done when" check for real. `pnpm dev:all` starts the whole stack; frontend work has to be looked at in a browser, at the widths and with the inputs the plan names.
- If you cannot run a check, say so plainly. Never report something as verified when it was only type-checked.

## 5. Finish

1. In `PHASES.md`, set the status to `done`, or leave it `in progress` if anything in the phase is unfinished.
2. Append a dated entry under "Notes between phases": what later phases need to know that the plan files do not say, any decision I made during the session, anything left open, and any defect you noticed outside the scope.
3. If your work makes a later phase's brief wrong, correct that brief.
4. Commit those changes to `PHASES.md`.
5. Push the feature branch: `git push -u origin feature/phase-NN-short-name`.
6. Open a pull request into `master` with `gh pr create --base master`. Title: `Phase NN: <items and short name>`. Body: what changed per item, what you verified and how, what you could not verify, where you departed from the plan and why, and anything left open. If the phase is unfinished, open it as a draft (`--draft`) and say what remains.
7. Do not merge the pull request; I review and merge it.
8. Report to me, leading with the pull request link and anything I need to decide or check, then the same summary as the pull request body.

Push and open the pull request even if the phase is only partly done, so the work is never left only on this machine. The one exception: if you stopped because a rule in section 2 or 3 told you to stop before any code was written, there is nothing to push.
