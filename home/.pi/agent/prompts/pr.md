---
description: Review unstaged/unstashed git changes, make a conventional commit, and open a GitHub PR
---
Analyze the current git working tree and prepare it for a pull request.

Follow this workflow:

1. Inspect the repo state first:
   - Run `git status --short --branch`
   - Review all local changes with `git diff --stat`, `git diff --cached`, and `git diff`
   - Identify the intent and scope of the changes

2. Validate the changes before committing:
   - Run the relevant tests, linters, or checks for the modified files
   - If something is obviously broken, fix it before continuing
   - Summarize any important risks or assumptions

3. Create a conventional commit:
   - Stage the appropriate files
   - Write a conventional commit message that matches the actual change (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc.)
   - Commit the changes

4. Prepare the PR:
   - Determine the current branch and compare it against the default base branch
   - Create a concise PR title based on the commit(s)
   - Write a PR body with:
     - summary
     - key changes
     - validation/tests run
     - risks or follow-ups

5. Open the PR with GitHub CLI:
   - Use `gh pr create` with the generated title and body
   - If the branch has not been pushed yet, push it first

6. Report back with:
   - the commit hash and commit message
   - the PR URL
   - any checks not run or follow-up work needed

Important constraints:
- Do not invent details about tests or validation; only report what was actually run
- Keep the commit focused; if the working tree contains unrelated changes, call that out before committing
- Prefer small, accurate conventional commits over overly broad ones
