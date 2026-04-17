---
description: "Use when: creating or modifying Next.js API routes, route handlers, or server-side endpoints. Covers input validation, error handling, caching, and security patterns for this project."
applyTo: "app/api/**/*.ts"
---
# API Route Standards

## Input Validation (at the boundary)
- Validate all query params and body fields at the top of the handler.
- Return `400` with a descriptive JSON error for invalid input.
- Clamp numeric params (e.g., `page = Math.max(1, page)`) instead of rejecting.
- Limit string params to a max length (e.g., `query.length > 200 → 400`).

## Response Patterns
- Always return `Response.json()` with appropriate status codes.
- Add `Cache-Control: public, s-maxage=300` for public feeds (news, article).
- Add `Cache-Control: no-store` for user-specific data (watchlist).
- Wrap Supabase calls in try/catch; return `500` with `{ error: 'Internal server error' }`.

## Security
- Never expose internal error messages to clients.
- Import Supabase client from `@/lib/supabase` (server-side singleton, service role key).
- No API keys or secrets in response bodies.

## Existing Patterns (reference)
- `app/api/news/route.ts` — paginated feed with tag filtering, Cache-Control.
- `app/api/search/route.ts` — semantic search, embed server dependency, 503 on failure.
- `app/api/watchlist/route.ts` — POST/DELETE CRUD, no-store cache, body validation.
