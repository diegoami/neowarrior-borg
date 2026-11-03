# Process

`CLAUDE.md` holds the rules; this file says how work runs. The system is
malpaco's (which is Geoclick2027's), cut down to what a one-mod fork needs.

## 1. Setup

    pnpm install --frozen-lockfile
    pnpm verify                 # typecheck, suite, plugin.js currency

The play harness boots the real game and needs the content pack: a sibling
checkout of `neo-angband` at `../neo-angband`, or `NEO_ANGBAND_REPO` pointing
at one. Without it, play tests skip out loud. The published engine and SDK in
`package.json` are what a player runs; the sibling checkout only supplies
gamedata for harness runs.

Optional: `gh` (issues, labels, releases).

**Watching it play the real game** (the restart loop and title row need
creation seams the game grants only to first-party mods, #28):

1. Game checkout on its local `neowarrior-lab` branch (never pushed): it
   trusts `diegoami/neowarrior-borg` as a first-party origin and carries the
   local engine `noteSpot` fix (upstream neostryder/neo-angband#428) until a
   fixed engine releases.
2. One-time, at the game repo root: `pnpm install --frozen-lockfile && pnpm build` —
   the workspace packages' `dist/` must exist before the dev server runs (vite
   resolves e.g. `@rpgm-tools/neo-angband-linoleum/targets` into `dist/`; a
   fresh checkout has none, and the failure is a black screen with "Failed to
   resolve import" in the terminal).
3. Launch: `cd packages/web && NEO_ANGBAND_LAB_BUILD=1 pnpm dev` (the game repo
   ROOT has no `dev` script) — web: open the served URL with
   `?labtrust=neowarrior` appended; or the desktop build with
   `--lab-trust=neowarrior`.
4. In-game: third-party mods allowed → choose a mods folder → install this repository as a folder →
   **B** on the title screen. Answer the game's own confirm question for the
   manage seam once. The picked folder's NAME must equal the manifest id —
   clone or copy the repo into a folder called exactly `neowarrior`
   (`git clone -b v0.1.0 <repo> neowarrior`); `neowarrior-borg` is rejected
   with "manifest says id neowarrior". Without the lab build, the first death
   ends the run by design (fail-closed; headless play is unaffected).

## 2. Task files

`docs/tasks/T<nn>.md` from [`TEMPLATE.md`](tasks/TEMPLATE.md). 150-400 words.
**Done when** lines are each one check a command can run, and each fails on
`main` before the task is dispatched. A task likely to outlive about an hour of
implementation is split. The main session edits task files directly on `main`.

## 3. The loop

`status:ready → implement → merge → record`. One branch per task,
`task/T<nn>-<slug>` from `main`, squash-merged with the task's issue number in
the message. Push after every commit. Implementer contract:

- Build only what the task asks. A Done-when you cannot meet: stop and report.
- Every new test fails before the change and passes after; say how you checked.
- Rule 1: a behaviour change carries its run record in the same merge.
- Rule 6: a play-harness failure is checked against pristine upstream before
  it is believed to be ours.
- Update any document the change makes wrong. Never write status into a
  document; that is what labels are for.

## 4. Milestones

A milestone is a coherent slice (the queue in `docs/tasks/README.md` names one)
ending in a tagged release. When its tasks are merged:

1. Version bump and changelog land on `main`; that commit is the **candidate**.
2. The main session opens a **milestone issue** (label `milestone`): proposed
   tag, candidate SHA, merged tasks, checks run, the claims to verify with
   `file:line`, and the owner decisions that are not defects.
3. The owner runs a reviewer of their choosing against the milestone issue, in
   a fresh session, with a prompt from [`docs/review-prompt.md`](review-prompt.md).
   The reviewer verifies claims against the code, opens one issue per
   reproduced finding, and posts AGREE or BLOCK on the milestone issue. It
   never edits the repository. The milestone review covers everything merged
   since the previous tag, including tasks that merged without a review - the
   milestone issue lists them.
4. BLOCK findings are fixed in ordinary tasks; the candidate moves and the
   owner re-reviews. AGREE (or an owner tag without review, noted on the issue)
   tags the SHA. Tags never move (rule 9).

**The milestone review is the gate; tasks do not wait for reviews.** A task
merges when its Done-whens pass under the main session's own verification. A
per-task review happens only when the owner asks for one, or when the main
session flags a task as high-risk before merge and says why. The main session
never auto-dispatches a reviewer and never model-pairs one; the owner chooses.

## 5. Run records

See [`docs/runs/README.md`](runs/README.md) for the format. In short: every
measured session leaves a directory under `docs/runs/` with a table (markdown,
committed) and the raw per-run JSON (committed); a watched desktop run adds a
`watched.md` with what a human saw. The harness writes the JSON; the table is
curated by hand from it. Baselines never get edited after the fact - a changed
harness writes a new directory and says what changed.

## 6. Questions and decisions

Owner decisions are gathered early: when a milestone is planned, the main
session lists every foreseeable decision on the milestone issue, each with
options and a recommendation, and works on whatever no question blocks. A
question nobody could foresee is asked when it appears.

## 7. Upstream sync

`neostryder/neo-angband-mod-borg` is fetched as a remote (`upstream`).
Upstream fixes worth having are cherry-picked or merged by hand, in a merge
whose message names the upstream SHA, and `pnpm verify` plus a harness
re-baseline decides whether the fork's records carry over. Divergence debt is
tracked in the task list, not in this file.

**The sister fork.** Class-agnostic improvements live in
[better-borg](https://github.com/diegoami/better-borg) (same import boundary
`1fa2f8d`, so cherry-picks are trivial): found something generic while
working here, file it there; landed something there that warriors need,
cherry-pick it here with the source SHA in the merge message. Port defects
are staged in better-borg and offered upstream as PRs.
