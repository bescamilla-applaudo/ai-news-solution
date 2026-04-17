# Code Review Report Template

Use this template to generate the review output. Replace placeholders with actual findings. Remove empty severity sections (e.g., if no Critical issues, omit that table entirely).

---

## Code Review Report — AI News Intelligence Platform

**Date:** {YYYY-MM-DD}  
**Scope:** {scope description — e.g., "PR #7: feature/refresh-button" or "Full audit of app/api/"}  
**Branch:** `{branch_name}`  
**Files reviewed:** {file_count}

---

### Summary

Pick ONE status icon per category: ✅ (all items pass), ⚠️ (warnings only), ❌ (has critical issues).  
Count = total findings in that category across all severities.

One row per checklist section. Omit rows for sections skipped during scoped reviews.

| Category | Checklist § | Status | Findings |
|----------|-------------|--------|----------|
| TypeScript (Frontend) | §1 | {✅ ⚠️ ❌} | {n} |
| Python (Worker) | §2 | {✅ ⚠️ ❌} | {n} |
| Security | §3 | {✅ ⚠️ ❌} | {n} |
| Design Patterns | §4 | {✅ ⚠️ ❌} | {n} |
| Testing | §5 | {✅ ⚠️ ❌} | {n} |
| Database | §6 | {✅ ⚠️ ❌} | {n} |
| Docker / DevOps | §7 | {✅ ⚠️ ❌} | {n} |
| Documentation | §8 | {✅ ⚠️ ❌} | {n} |

---

### Findings

#### 🔴 Critical

| # | File | Line | Description | Recommendation |
|---|------|------|-------------|----------------|
| 1 | `path/to/file.ts` | L42 | {what is wrong} | {how to fix} |

#### 🟡 Warning

| # | File | Line | Description | Recommendation |
|---|------|------|-------------|----------------|
| 1 | `path/to/file.ts` | L15 | {what is wrong} | {how to fix} |

#### 🔵 Info

| # | File | Line | Description | Recommendation |
|---|------|------|-------------|----------------|
| 1 | `path/to/file.ts` | L8 | {what could improve} | {suggestion} |

---

### Score

Rate each criterion 0–10 independently, then compute the weighted average.

| Criterion | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Zero critical issues | 30% | {0-10} | 10 = none, 0 = 3+ critical |
| Pattern compliance | 20% | {0-10} | Adherence to project conventions |
| Security posture | 20% | {0-10} | OWASP, RLS, input sanitization |
| Test coverage for changes | 15% | {0-10} | New code has tests, mocks used |
| Documentation sync | 15% | {0-10} | Docs match code state |

**Weighted score: {calculated}/10**

Formula: `(critical×0.30 + patterns×0.20 + security×0.20 + tests×0.15 + docs×0.15)`

---

### Verdict

- **✅ Approved** — No critical issues. Merge-ready.
- **⚠️ Approved with comments** — No critical issues, but warnings should be addressed.
- **❌ Changes requested** — Critical issues must be fixed before merge.
