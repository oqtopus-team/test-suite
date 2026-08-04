## Pull Request title & description instructions

Generate the Pull Request title and description for this repository.
Write in English with a professional, friendly tone. Keep it concise and scannable.

### Title

- Format: `<type>(<scope>): <summary>` (example: `fix(ui): prevent metrics page layout shift`)
- `type`: `feat|fix|docs|style|refactor|test|ci|chore`
- `scope`: use `api|workflow|ui|docs|infra|repo` when clear (omit if unclear)
- One line, no emojis
- If there is a related issue, append `(#123)` at the end
- **Do NOT include internal ticket/design-doc IDs** (e.g. `QA-001`, `CLOUDDEV-260`, `WT-172`, `AUTH-004`) in the title — these are internal references and have no meaning to external readers

### Description

Follow the section structure in `.github/pull_request_template.md` and fill each section as described below.

#### Ticket

- Write `N.A.` — internal ticket links are not included in PRs

#### Summary

- Explain what changed and why (1–2 sentences)
- Mention impact/risk and affected areas (API/Workflow/UI, compatibility, config changes)
- **Do NOT include internal ticket/design-doc IDs** in the summary text

#### Changes

- List key changes as bullets (focus on outcomes, not implementation trivia)
- For UI changes, include the screen/component name (e.g., `MetricsPageContent`)
- If OpenAPI/schema or generated client changes are involved, mention it (and whether generation was run)
