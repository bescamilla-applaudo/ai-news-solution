---
name: code-review
description: "Run a structured code review of the AI News Intelligence Platform. Use when: reviewing PRs, auditing code quality, checking design pattern compliance, validating security practices, or generating a review report. Covers TypeScript strict mode, Python type hints, API route patterns, LangGraph pipeline, Supabase RLS, input sanitization, testing coverage, Docker configuration, and ARCHITECTURE.md alignment."
argument-hint: "app/api/news/route.ts, worker/pipeline/, components/, 'all' for full audit, or a branch name for PR diff"
---

# Code Review — AI News Intelligence Platform

## Purpose

Perform a structured code review that validates code against the project's architecture, design patterns, and quality standards. Produces a Markdown report with categorized findings.

## When to Use

- Before merging a PR to `develop`
- After implementing a new feature or endpoint
- Periodic quality audit of a subsystem (frontend, pipeline, scrapers)
- When the user asks to "review", "audit", or "check" code quality

## Review Procedure

### Step 1 — Determine Scope

Identify what to review:
- **PR review**: Use `git diff develop..HEAD` to find changed files
- **Area review**: Review all files in the specified directory
- **Full audit**: Review all source files across frontend and worker

### Step 2 — Load Architecture Context

**MANDATORY before proceeding to Step 3.** Read these files in order:

1. `ARCHITECTURE.md` — system design, schema, security model, deployment topology
2. The relevant `.github/instructions/*.instructions.md` files for the area under review:
   - `api-routes.instructions.md` — for `app/api/**/*.ts`
   - `react-components.instructions.md` — for `components/**/*.tsx`
   - `pipeline.instructions.md` — for `worker/pipeline/**/*.py`
   - `scrapers.instructions.md` — for `worker/scrapers/**/*.py`
   - `migrations.instructions.md` — for `supabase/migrations/**/*.sql`

Cross-reference reviewed code against the patterns documented in these files.

### Step 3 — Run the Checklist

Apply the review checklist from [./references/checklist.md](./references/checklist.md). For each item:
- **✅ Pass** — code complies
- **❌ Fail** — code violates, record as a finding with the severity indicated in the checklist
- **N/A** — item does not apply to the files under review (skip)

**Scoped reviews:** Skip entire checklist sections that have no files in scope. For example, a PR touching only `worker/scrapers/` should skip §1 TypeScript, §6 Database, and §8 Documentation unless the PR also modifies those areas. Only report findings for sections with reviewed files.

### Step 4 — Generate Report

Output the report using the template from [./references/report-template.md](./references/report-template.md). Include:
- Summary with pass/fail per category
- Detailed findings with file, line, severity, and recommendation
- Weighted score out of 10

## Severity Levels

| Level | Icon | Meaning |
|-------|------|---------|
| Critical | 🔴 | Security vulnerability, data loss risk, or broken functionality |
| Warning | 🟡 | Pattern violation, missing validation, or degraded quality |
| Info | 🔵 | Style improvement, minor optimization, or documentation gap |

## What This Skill Does NOT Do

- Does not auto-fix issues (report only)
- Does not run tests (use `pnpm test` / `pytest` separately)
- Does not review `node_modules/`, `.venv/`, or generated files
