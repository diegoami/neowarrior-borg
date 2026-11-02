# Review prompts

The template for owner-launched reviews. By default there is one review per
milestone: the big review of everything since the previous tag, before it is
tagged. A per-task review happens only when the owner asks for one, or when
the main session flags a task as high-risk before merge and says why
(`docs/process.md` §4). The owner launches any model they choose against a
checkout of the repo with the prompt filled in; the main session never
auto-dispatches a reviewer.

The reviewer posts its findings and verdict to GitHub itself, with `gh`, and
never touches the repository: no edits, commits, pushes, merges or tags. This
is malpaco's split — the reviewer's output lives in the tracker next to the
work, and the repo only ever changes through task branches.

## Template

    You are the independent reviewer of <task T<nn> | milestone M<n>> in the
    repository at /home/diego/projects/angband/neowarrior-borg. You implemented
    none of it: verify everything against the code, not commit messages,
    docs or reports.

    SET UP
      source ~/.nvm/nvm.sh
      cd /home/diego/projects/angband/neowarrior-borg
      git checkout <branch>    # head <sha>, from main @ <base>
    Read first: AGENTS.md, CLAUDE.md (rules, cited as "rule n"), the task
    file docs/tasks/T<nn>.md, and docs/plans/m1.md for milestone context.

    THE CLAIMS TO VERIFY (filled in per task; each with file:line evidence):
      <one line per claim, taken from the task's Done-whens and the
       implementation record on the issue>

    RUN
      <the commands, with expected results>
      <known tolerated failures, with their issue and run-record references>

    LOOK HARDEST AT: <task-specific risks: tests that pass without the
    behaviour they claim, invented rules, the interpretation pins, scope>

    WRITE TO GITHUB YOURSELF (gh is authenticated), and nothing else:
    - one issue per reproduced finding, labels `review` plus one of `bug`,
      `tests`, `design`, `cleanup`, `documentation`; MUST-FIX or follow-up in
      the title's prefix; link the task issue and the SHA reviewed;
      gh issue create --repo diegoami/neowarrior-borg --title "MUST-FIX: ..." \
        --label review --label bug --body-file <file>
    - exactly one verdict comment on the task issue (#<n>): AGREE, or BLOCK
      when any finding is MUST-FIX; the SHA reviewed, your model, the checks
      you ran and their results, the issues you opened, and what you checked
      and found clean:
      gh issue comment <n> --repo diegoami/neowarrior-borg --body-file <file>
    Never edit, commit, push, merge or tag anything in the repository.

## Verdicts

- AGREE: the main session squash-merges the branch, labels the issue
  `status:merged`, and proceeds to the next task.
- BLOCK: findings are fixed on the same branch (a follow-up session of the
  implementer works well), Done-whens re-verified, and a fresh prompt is
  generated for the new head. After a third round without AGREE the owner
  decides.
