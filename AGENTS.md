# Agents

For any agent or tool working in this repository (OpenCode, Codex, Claude Code, others):

- **What this is**: a hard fork of the Borg mod whose one goal is a warrior-only
  Borg that gets as deep as it can. [README](README.md) says what differs from
  upstream.
- **Rules**: [`CLAUDE.md`](CLAUDE.md) (numbered, cited as "rule n").
- **Process**: [`docs/process.md`](docs/process.md): setup, task files, the
  loop, run records, milestones.
- **Tasks**: [`docs/tasks/README.md`](docs/tasks/README.md) indexes
  `docs/tasks/T<nn>.md`; the issue's `status:*` label is the status.
- **Plan**: [`docs/plans/m1.md`](docs/plans/m1.md) - the current milestone's
  goal, architecture, sequence and acceptance. **Backlog**:
  [`docs/BACKLOG.md`](docs/BACKLOG.md) - ranked, with evidence, cut into
  tasks when the baseline ranks them.
- **Run records**: [`docs/runs/README.md`](docs/runs/README.md) - the format
  and the baselines. Depth progress is the project's number; a change without
  a record is an unmeasured change.

Upstream is `neostryder/neo-angband-mod-borg`; the import commit is the
boundary. Nothing upstream owes this fork anything: fixes flow upstream-first
when they are defects in the port, and stay here when they are warrior choices.
