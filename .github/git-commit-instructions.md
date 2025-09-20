# Commit Message Guidelines

## Format

```bash
type(scope)!: Capitalized subject
```

- **type** – see list below
- **scope** – affected area (lowercase; kebab-case if needed)
- **!** – include if the change is **breaking**
- **subject** – imperative, ≤ 72 characters, no trailing period

---

## Types

- **feat** – new user-facing feature
- **fix** – user-facing bug fix
- **refactor** – code change without altering behavior
- **perf** – performance improvement
- **docs** – documentation changes only
- **test** – tests only
- **build** – build system, packaging, tooling
- **ci** – CI/CD configuration changes
- **deps** – add/update/remove dependencies
- **chore** – maintenance tasks (formatting, renaming, non-prod scripts)
- **release** – version tags and changelog updates
- **revert** – revert a previous commit

> Use **deps** instead of **chore** when the main change is dependency-related.

---

## Scopes

Keep scopes consistent within a project.
Examples:
`ui | api | db | infra | docs | mobile | tests`

---

## Subject Rules

- Use imperative mood: “Add” / “Fix” / “Refactor” (not “Added” or “Adds”)
- No trailing period
- Keep concise; use the body for details

---

## Body (Optional but Recommended)

Explain **what** changed and **why**, not file-by-file changes.
Wrap text at ~72 characters.
Consider including:

- Context and reasoning for the change
- Risks or follow-up actions
- Migration or rollout notes

---

## Footers

Common footers:

- `Fixes #123` / `Closes #123` / `Refs #456`
- `BREAKING CHANGE: <impact + migration>`
- `Co-authored-by: Name <email>`
- `Security: <impact or CVE>`
- `Signed-off-by: Name <email>`

If breaking changes exist and `!` is not used, include a `BREAKING CHANGE:` footer.

---

## Examples

```bash
feat(api): Add refresh token endpoint
fix(ui): Correct button alignment in modal (Fixes #42)
refactor(db): Move RLS policies to separate schema file
perf(web): Defer data sync until window idle
deps(core): Upgrade framework to v2.5.0
```

Breaking change example:

```bash
feat(auth)!: Require MFA for all login endpoints
BREAKING CHANGE: Users must configure MFA before logging in.
```

---

## When to Split a Commit

Split commits when:

- Mixing multiple **types** (e.g., `feat` + `fix`)
- Changes affect unrelated **scopes**
- A dependency bump includes unrelated refactors

---

## Revert Template

```bash
revert: Revert "<original commit subject>"

This reverts commit <sha>.
Reason: <explanation>.
```
