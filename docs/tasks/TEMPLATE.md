# T<nn> <Title>

- **Kind**: feature | correction (of T<nn>, bug #<n>) | slice | infrastructure
- **Issue**: #<n> · **Branch**: `task/T<nn>-<slug>` · **Merge after**: T<nn>, …
- **Review**: none | milestone review covers it (this repo has no per-task
  reviews unless the owner asks for one)
- **Owns**: directories or files, e.g. `src/birth/plan.ts`, `src/birth/**`.
- **Scope**: what to build, in a few sentences. What is out of scope if it is
  easy to confuse. Name the upstream C or TS a change sits beside (rule 2).
- **Done when**:
  1. One check a command can run, with the expected result. Before dispatch it
     fails on `main`.
  2. …
  3. `pnpm verify` is green (play tests may skip without the game's checkout;
     anything else red is a blocker).
- **Hazards**: the mistake an implementer is most likely to make here, and how
  to avoid it. For behaviour changes: which run record (rule 1) proves it.
