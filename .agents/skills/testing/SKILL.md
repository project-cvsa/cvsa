---
name: testing
description: Guide for writing, reviewing, and refactoring high-signal automated tests across all TypeScript packages and apps in CVSA. Activate whenever adding tests, fixing brittle or flaky tests, or reviewing test quality during implementation and review.
---

# Writing High-Signal Tests

Coding agents frequently generate low-value tests that pass today while missing real regressions or breaking whenever internal helpers change. Follow [Testing standards](../../../apps/docs/content/engineering/practices/testing.md) and apply these checks whenever writing, reviewing, or refactoring tests.

## 1. Agent Failure Modes to Prevent

Reject these five patterns before writing or keeping any test:

- **Unnecessary smoke or trivial tests**: Calling functions or rendering components solely to assert they do not throw, or testing trivial getters, defaults, and guarantees already enforced by TypeScript.
- **Over-testing**: Repeating nearly identical assertions for minor edge variations already covered by a broader contract test.
- **Testing internal implementation details**: Asserting private helper functions, intermediate internal state shapes, exact internal call counts, or private log messages.
- **Refactor-brittle mocks**: Mocking internal collaborators or asserting strict internal call ordering so tests fail whenever internals are reorganized without changing external behavior.
- **Meaningless assertions**: Placeholder assertions (`expect(res).toBeDefined()`), mocking the module under test, or tautological assertions that keep passing even when real logic breaks.

## 2. How to Design Each Test

1. **Name the guarantee first**: Identify the observable behavior, HTTP/Zod contract, domain state transition, lease/idempotency guarantee, or invariant (e.g., `claimDueVideos` compare-and-set leasing, `Temporal.Instant` boundary math, `AppError` status/code mapping, `ApiResult` error parsing) the test protects.
2. **Use minimal real inputs**: Build the smallest valid input that exercises the real public entry point (an Elysia Eden Treaty route, domain Service, repository query, or `api.<module>` wrapper) instead of reconstructing internals with mocks.
3. **Double only genuine external edges**: Keep fakes or mocks strictly at external boundaries such as Bilibili HTTP adapters, clocks, BullMQ queues, or repository interfaces in pure unit tests (`InMemoryDiscoveryRepository`, `InMemoryTrackingRepository`).
4. **Separate fast unit tests from DB-backed suites**:
   - **`apps/backend`**: E2E contract tests using Elysia Eden Treaty against test PostgreSQL (`cvsa_test`), Redis, and Meilisearch.
   - **`apps/crawler` & `packages/snapshot-db`**: Fast offline unit tests with in-memory fakes (`*.test.ts`), and `*.db.test.ts` / `packages/snapshot-db/tests/` integration tests for real SQL, Drizzle queries, TimescaleDB hypertables, and triggers against `cvsa_snapshot_test`.
   - **`apps/web`**: Vitest unit and contract tests (`apiContract.test.ts`, `design-tokens.test.ts`, component interaction tests); leave visual layout and interactive review to human reviewers per [UI Collaboration](../../../apps/docs/content/engineering/practices/ui-collaboration.md).
   - **Determinism**: Avoid brittle real-time `sleep` waits or shared mutable test state; keep every test self-contained and idempotent.

## 3. Post-Write Review

- If the protected behavior is subtly broken, will this test fail with a clear diagnostic?
- If internal functions or modules are reorganized without changing public contracts, will this test keep passing without rewriting mocks?
- Does the test description state the protected behavior or invariant rather than an internal implementation step?
