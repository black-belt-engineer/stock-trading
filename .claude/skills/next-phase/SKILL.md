---
name: next-phase
description: Implement the next roadmap phase from roadmap/PHASES.md on a feature branch and open a pull request for the owner to review. Refuses to start while any phase pull request is still open.
argument-hint: "[phase number, e.g. 14]"
disable-model-invocation: true
---

You are implementing **one** phase of this repo's roadmap. Do exactly one phase, then stop.

Phase requested by the owner: `$ARGUMENTS` (empty means "the next one").

## The project

A pnpm/turbo monorepo for a real-time stock price dashboard. A simulated ingestor publishes ticks to Kafka. A consumer writes them to Postgres and Redis, and the SSE service streams them to a React frontend. Identity is Keycloak (realm and compose service in `infra/keycloak`, Keycloakify theme in `apps/keycloak-theme`). The tokens are held by a backend-for-frontend, `apps/bff`, which proxies `/quotes/*` and `/stream` with the bearer token. This is a portfolio and learning project: correctness and clear code matter more than speed.

## 0. Gate: no open pull request

Do this before anything else. Stop if any check fails.

1. Run `git fetch origin --prune` and `gh pr list --state open`.
2. If **any** pull request is open, stop. List each one with its number, title, branch and link, and tell the owner that the next phase starts only after it has been merged or closed. Don't create branches, edit files or "prepare" anything.
3. Run `git status`. If there is uncommitted work, stop and ask the owner what to do with it. Don't commit, stash or discard it yourself.

## 1. Find your phase

1. Update local master: `git checkout master && git pull --ff-only origin master`. If the fast-forward fails, stop and tell the owner.
2. Read `roadmap/PHASES.md`. Your phase is the number in `$ARGUMENTS` if one was given. Otherwise it is the first row in the status table whose status is not `done`.
3. Check the "Needs" column. If a phase it depends on is not `done` on master, stop and tell the owner.
4. Run `git branch -a --list '*phase-NN-*'` and `gh pr list --state closed --search "Phase NN"`. If a branch or a closed, unmerged pull request for this phase exists, stop. Ask the owner whether to continue that branch or start over.
5. Read, in this order:
   - `roadmap/README.md` (decisions and build order)
   - the plan file sections for your phase's items
   - your phase's brief in `PHASES.md`
   - all of "Notes between phases", especially the newest entries
   - any ADRs in `docs/adr/` that the brief mentions

## 2. Before touching code

1. Create a feature branch from `origin/master` named `feature/phase-NN-short-name` (for example `feature/phase-13-search-feed-table`). Never work on `master`.
2. Set your phase's status to `in progress` in `PHASES.md` and commit it.
3. Read the code the plan refers to and compare it with what the plan says. Earlier phases (especially 12, which replaced the hand-written auth) may have moved things. The notes say where.

## 3. Rules

- The plans and the decisions in `README.md` are final. Each item lists the problem, the steps, the edge cases and a "Done when" check. Follow them.
- If the code has drifted from a plan, a step turns out to be wrong, or the plan leaves a choice open: stop and ask the owner. Don't improvise a different design.
- Where the brief says "Ask the owner", ask before writing the code that depends on the answer (use AskUserQuestion). Carry on with anything that doesn't depend on it.
- Stay inside the phase. If you notice a defect outside its scope, don't fix it; record it in your notes.
- Check current documentation (Context7) before writing code that depends on a library, framework or database feature.
- TypeScript: no `any`, no non-null `!`, no `as` casts. Use type guards.
- Commit as you go on the feature branch, in small commits with Conventional Commit messages (`feat(frontend): …`, `fix(bff): …`). Never commit to or push `master`, and never force-push.

## 4. Verify

The laptop has 16 GB RAM and froze once under load, so:

- Before each heavy command (build, tsc, eslint, vitest, install, `pnpm dev:all`), check `free -m`. If "available" is under 3000 MB, stop and ask the owner to close something.
- Run heavy commands one at a time, prefixed with `nice -n 19 ionice -c3`. Never run them in parallel.
- Vitest: `--maxWorkers=2` (contract tests `--maxWorkers=1`). While working, run only the affected test files. Run the full gate once at the end.

Then:

- Run `pnpm build` after each item.
- Run the item's "Done when" check for real. `pnpm dev:all` starts the whole stack. Frontend work has to be looked at in a browser, at the widths and with the inputs the plan names. Log in through the BFF (`/bff/login`).
- If you can't run a check, say so plainly. Never report something as verified when it was only type-checked.

## 5. Finish

1. In `PHASES.md`, set the status to `done`. Leave it `in progress` if anything in the phase is unfinished.
2. Append a dated entry `### After phase NN (YYYY-MM-DD)` under "Notes between phases". Include:
   - what later phases need to know that the plan files don't say
   - any decision the owner made during the session
   - anything left open
   - any defect you noticed outside the scope
3. If your work makes a later phase's brief wrong, correct that brief.
4. Commit those `PHASES.md` changes.
5. Push the branch: `git push -u origin feature/phase-NN-short-name`.
6. Open a pull request into `master` with `gh pr create --base master`.
   - Title: `Phase NN: <items> <short name>` (for example `Phase 13: D1, D2, D3 search, feed controls, table view`).
   - Body: what changed per item, what you verified and how, what you could not verify, where you departed from the plan and why, and anything left open.
   - If the phase is unfinished, open it as a draft (`--draft`) and say what remains.
7. **Never merge the pull request.** The owner reviews and merges it.
8. Report to the owner. Lead with the pull request link and anything they need to decide or check, then the same summary as the pull request body.

Push and open the pull request even if the phase is only partly done, so the work is never left only on this machine. One exception: if you stopped before writing any code because a rule in sections 0–3 told you to, there is nothing to push.

Then stop. Don't start the next phase in the same session. The owner runs `/next-phase` again after merging.
