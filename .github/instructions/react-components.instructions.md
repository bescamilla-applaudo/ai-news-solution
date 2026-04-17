---
description: "Use when: creating or modifying React components, building UI features, or working with Shadcn/UI. Covers component patterns, testing, and styling conventions."
applyTo: "components/**/*.tsx"
---
# React Component Standards

## Component Organization
- Shadcn/UI primitives → `components/ui/` (auto-generated, rarely edit).
- Custom components → `components/` root (e.g., `article-card.tsx`, `news-feed.tsx`).
- Server Components by default. Add `"use client"` only when hooks/interactivity are needed.

## Data Fetching
- Use React Query (`@tanstack/react-query`) for all client-side data fetching.
- `QueryProvider` is in `components/providers/query-provider.tsx`.
- API calls go to internal routes (`/api/news`, `/api/search`, etc.), never directly to Supabase.

## Styling
- Tailwind CSS v4 utility classes. Dark mode is default.
- Use `cn()` from `@/lib/utils` for conditional class composition.
- Shadcn/UI uses `data-slot` attributes — use these in test selectors.

## Testing (REQUIRED for new components)
- Tests in `__tests__/components/<component-name>.test.tsx`.
- Use `@testing-library/react` with `vitest`.
- Mock API calls with `vi.fn()` — never hit real endpoints.
- Test: render, user interaction, loading states, error states, edge cases.

## Existing Patterns (reference)
- `components/article-card.tsx` — Score bars, tag badges, truncation, minimal mode.
- `components/news-feed.tsx` — Tag filter buttons, React Query, loading skeletons, empty state.
- `components/watchlist-manager.tsx` — Optimistic toggle, per-tag inflight tracking, rollback on error.
