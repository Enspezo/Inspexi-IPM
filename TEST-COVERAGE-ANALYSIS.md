# Test Coverage Analysis — InspeXi IPM

**Date:** 2026-02-28
**Scope:** Full codebase (API unit tests, API E2E tests, Frontend tests)

---

## Executive Summary

| Layer | Tests | Files Covered | Coverage |
|-------|-------|--------------|----------|
| API Unit Tests | 163 tests, 10 suites | 10/21 services (48%) | **Partial** |
| API E2E Tests | ~98 tests, 9 suites | 9/20+ controllers (~40%) | **Partial** |
| Frontend Tests | 0 tests | 0/143 files (0%) | **None** |

The codebase has reasonable API test coverage for core CRM/quote modules, but significant gaps exist in newer modules, infrastructure/security layers, and the entire frontend.

---

## 1. API Unit Tests — Current State

### Tested Services (10/21)

| Module | Tests | Key Methods Covered |
|--------|-------|---------------------|
| auth | ~10 | login, refresh, logout, getMe |
| contacts | ~20 | findAll, findOne, create, update, softDelete, addresses, locations, logs, email |
| notifications | ~14 | findAll, unreadCount, markRead, markAllRead, dispatch, savePrefs |
| organizations | ~8 | create, findAll, findOne, update |
| price-tables | ~18 | findAll, findOne, create, update, setItems, assign/remove contact, findForContact |
| products | ~14 | findAll, findOne, create, update |
| quote-templates | ~7 | findAll, findOne, create, update, deactivate |
| quotes | ~22 | findAll, findOne, create, update, setLines, approval flow, resolvePrice, createFromRequest |
| requests | ~15 | findAll, findOne, create, update, updateStatus, softDelete |
| users | ~16 | findAllByOrg, invite, acceptInvitation, deactivate, changeRole, updateProfile |

### Untested Services (11/21) — Recommended Actions

#### Critical Priority

| Service | Methods | Why Critical |
|---------|---------|-------------|
| **planning.service** | findAll, findOne, create, update, assignInspectors, rejectPlanning, schedulePlanning, reschedule, cancel, addQuestion, addFollower, session CRUD | Largest untested module (~400+ lines). Complex multi-step workflows with notifications and state transitions. |
| **documents.service** | upload, findAll, findOne, download, update, softDelete, enrichWithEntityNames | Core feature with storage abstraction layer. Needed before S3/cloud migration. MIME validation, multipart handling. |
| **audit-log.service** | findAll, findOne, enrichUUIDs, formatAuditValue | Compliance-critical. Complex UUID-to-name resolution with batch FK lookups across 14 models. |

#### High Priority

| Service | Methods | Why Important |
|---------|---------|--------------|
| **tasks.service** | findAll, findOne, create, update, softDelete, enrichWithEntityNames | Core feature, entity polymorphism (links to contacts, requests, quotes, planning). |
| **search.service** | search (+ 7 private search methods) | Cross-entity search across contacts, requests, quotes, tasks, documents, products. Role-based visibility. |
| **quote-scheduler.service** | expireOverdueQuotes | Cron job — must not cause race conditions or send duplicate notifications. |

#### Medium Priority

| Service | Methods | Why |
|---------|---------|-----|
| **customer-groups.service** | CRUD + addContact/removeContact | Simple but used in CRM flow |
| **product-groups.service** | CRUD + softDelete | Simple CRUD |
| **planning-email.service** | 4 email sender methods | Email template rendering, date formatting |
| **planning-ical.service** | buildIcal, buildSessionsIcal | iCal format compliance, special character escaping |
| **geocoding.service** | suggest, lookup | External API (PDOK) integration, WKT parsing |

---

## 2. API E2E Tests — Current State

### Tested Endpoints (9 suites, ~98 tests)

| Module | Tests | Endpoint Coverage | Notable Gaps |
|--------|-------|-------------------|-------------|
| auth | 11 | 62% | Missing: reset-password, verify-email, sessions |
| contacts | 19 | ~60% | Missing: address PATCH/DELETE, location PATCH/DELETE, contact persons CRUD, send email, customer group assignment |
| organizations | 7 | 75% | Missing: logo upload/download/delete, user listing |
| products | 9 | 100% | — |
| price-tables | 10 | 100% | — |
| quote-templates | 8 | 100% | — |
| quotes | 13 | ~50% | Missing: send, PDF generation, public portal (token access, signing, Q&A), attachments |
| requests | 10 | 100% | — |
| users | 11 | ~50% | Missing: user detail, admin update, password reset, avatar, signature, inspector color |

### Modules Without Any E2E Tests

| Module | Endpoints | Impact |
|--------|-----------|--------|
| **documents** | 6 (upload, list, detail, download, update, delete) | Core feature, file upload/download untested |
| **tasks** | 5 (CRUD + delete) | Core feature |
| **audit-log** | 2 (my activity, entity trail) | Compliance |
| **notifications** | 4+ (list, mark read, preferences) | User-facing feature |
| **planning** | 10+ (CRUD, assign, schedule, reschedule, cancel, sessions, public) | Major feature module |
| **customer-groups** | 5 (CRUD + member management) | CRM feature |
| **product-groups** | 5 (CRUD + soft delete) | Catalog feature |
| **search** | 1 (global search) | Cross-cutting feature |
| **geocoding** | 2 (suggest, lookup) | Address resolution |

### Missing Cross-Cutting E2E Scenarios

- **Token expiration/invalidation** — no tests for expired JWT behavior
- **Rate limiting** — no abuse prevention testing
- **File upload security** — no MIME validation, size limit, or malicious file testing
- **Concurrent writes** — no optimistic locking or race condition tests
- **Pagination boundaries** — no edge cases (page=0, page=999, limit=0)
- **Unicode/special characters** — no internationalization edge cases
- **Cascading soft deletes** — no orphaned record prevention tests

---

## 3. API Infrastructure — Zero Test Coverage

This is the most concerning gap. All security enforcement runs through these layers, and none have unit tests.

| Component | File | Risk |
|-----------|------|------|
| **JwtAuthGuard** | `common/guards/jwt-auth.guard.ts` | Authentication bypass risk |
| **RolesGuard** | `common/guards/roles.guard.ts` | Authorization bypass risk |
| **TenantGuard** | `common/guards/tenant.guard.ts` | Multi-tenant data leakage risk |
| **TenantMiddleware** | `common/middleware/tenant.middleware.ts` | Subdomain spoofing risk |
| **HttpExceptionFilter** | `common/filters/http-exception.filter.ts` | Error information leakage |
| **AuditContextInterceptor** | `common/interceptors/audit-context.interceptor.ts` | Audit trail integrity |
| **LocalStorageProvider** | `common/services/storage/` | File storage integrity |
| **MimeTypeValidator** | `common/validators/` | Upload security |

### Recommended: Guard & Middleware Tests

```
guards/jwt-auth.guard.spec.ts     — test @Public() bypass, missing token, invalid token, expired token
guards/roles.guard.spec.ts        — test role hierarchy, missing decorator, insufficient role
guards/tenant.guard.spec.ts       — test org match, cross-tenant block, SUPERUSER bypass, unknown host
middleware/tenant.middleware.spec.ts — test subdomain extraction, caching, classification
```

---

## 4. Frontend Tests — Zero Coverage

**143 source files. 0 test files.**

Testing dependencies are installed (Vitest, Testing Library, jsdom) but no configuration or tests exist.

### Missing Test Infrastructure

| Need | Status |
|------|--------|
| vitest.config.ts | Does not exist |
| Test setup file (setup.ts) | Does not exist |
| Custom render wrapper with providers | Does not exist |
| API mocking (MSW or similar) | Does not exist |
| Test data factories | Does not exist |

### Untested Files by Category

| Category | Count | Examples |
|----------|-------|---------|
| Providers | 2 | AuthProvider, TenantProvider |
| Custom Hooks | 4 | use-api-query, use-api-mutation, use-audit-log, use-my-activity |
| Utility Libraries | 8 | api-client, tenant, download-file, has-role, audit-value-format, geocoding |
| UI Components | 15+ | Button, Input, Select, Modal, Table, Toast, RichTextEditor, SignatureCanvas |
| Layout Components | 5 | AppLayout, Sidebar, Header, DetailPageLayout, OrgSwitcher |
| Document Components | 3 | DocumentPreviewModal (250+ lines, 6 MIME renderers), DocumentsSection, UploadModal |
| Table Config | 7 | TableConfigSidebar, useTableConfig, column/filter components |
| Pages | 40+ | All page files across 18 domains |
| Page-specific Hooks | 25+ | useContacts, useQuotes, useTasks, useProducts, etc. |

---

## 5. Recommended Improvement Plan

### Phase 1: Foundation (High Impact, Blocks Everything Else)

**API — Security layer tests:**
1. `jwt-auth.guard.spec.ts` — Validate token verification, `@Public()` decorator, missing/invalid tokens
2. `roles.guard.spec.ts` — Role hierarchy enforcement, missing decorator handling
3. `tenant.guard.spec.ts` — Cross-tenant isolation, SUPERUSER bypass, unknown host handling
4. `tenant.middleware.spec.ts` — Subdomain extraction, org caching, domain classification

**Frontend — Test infrastructure:**
1. Create `vitest.config.ts` with jsdom environment and path aliases
2. Create `src/test/setup.ts` with jest-dom matchers
3. Create `src/test/test-utils.tsx` with wrapped render (AuthProvider, TenantProvider, QueryClient, Router)
4. Create mock factories for API client and auth/tenant contexts

### Phase 2: Critical Business Logic

**API unit tests for untested services:**
1. `planning.service.spec.ts` — Workflow state machine, inspector assignment, notifications
2. `documents.service.spec.ts` — Upload, download, MIME validation, storage abstraction, entity enrichment
3. `audit-log.service.spec.ts` — UUID resolution, FK field mapping, entity type filtering
4. `tasks.service.spec.ts` — CRUD, entity polymorphism, enrichment

**API E2E tests for untested modules:**
1. `documents.e2e-spec.ts` — Upload, download, list/filter, MIME validation, size limits
2. `tasks.e2e-spec.ts` — CRUD, assignment, status changes, entity linking
3. `notifications.e2e-spec.ts` — List, mark read, preferences

**Frontend utility tests:**
1. `api-client.test.ts` — Token refresh, error handling, 401 redirect, header injection
2. `tenant.test.ts` — Subdomain extraction, domain classification
3. `has-role.test.ts` — Role checking logic
4. `audit-value-format.test.ts` — Enum labels, date formatting, boolean conversion, currency

### Phase 3: Expand Coverage

**API unit tests:**
1. `search.service.spec.ts` — Multi-entity search, role-based visibility
2. `quote-scheduler.service.spec.ts` — Cron job, duplicate prevention
3. `customer-groups.service.spec.ts` — CRUD, member management
4. `geocoding.service.spec.ts` — External API error handling, WKT parsing

**API E2E — Fill gaps in existing suites:**
1. Auth: session management, password reset, email verification
2. Users: avatar/signature upload, user detail, admin updates
3. Quotes: public portal (token access, signing, Q&A), PDF generation
4. Contacts: contact person CRUD, address/location updates

**Frontend component tests:**
1. `auth-provider.test.tsx` — Login, logout, token refresh, 401 handling
2. `tenant-provider.test.tsx` — Subdomain detection, branding, theme application
3. `protected-route.test.tsx` — Redirect behavior, loading states
4. `sidebar.test.tsx` — Role-based navigation visibility
5. `document-preview-modal.test.tsx` — MIME type rendering, blob lifecycle

### Phase 4: Comprehensive Coverage

**Frontend page tests** (starting with highest-traffic pages):
1. Login page — Form validation, error handling, redirect after login
2. Contacts list/detail — Table config, filtering, CRUD modals
3. Quotes list/detail — Status flow, approval UI, line calculations
4. Dashboard — Widget rendering, data loading states

**Missing edge case tests across all layers:**
- Pagination boundaries (page=0, limit=0, page=999)
- Empty states (no data, no results)
- Unicode/special characters in text fields
- Concurrent writes and optimistic locking
- Zero-value and negative calculations in quotes

---

## 6. Quick Wins (Low Effort, High Value)

These can be done quickly and immediately improve confidence:

| Test | Effort | Value | Why |
|------|--------|-------|-----|
| `has-role.test.ts` | 30 min | Medium | Pure function, easy to test, used everywhere |
| `audit-value-format.test.ts` | 1 hr | Medium | Pure formatting functions, many edge cases |
| `tenant.test.ts` | 1 hr | High | Subdomain parsing is security-critical |
| `roles.guard.spec.ts` | 2 hrs | High | Authorization enforcement, pure logic |
| `tenant.guard.spec.ts` | 2 hrs | High | Multi-tenant isolation, pure logic |
| `customer-groups.service.spec.ts` | 2 hrs | Medium | Simple CRUD, good template for others |
| `tasks.service.spec.ts` | 3 hrs | High | Core feature, straightforward mocking |

---

## 7. Coverage Targets

| Metric | Current | Target (3 months) | Target (6 months) |
|--------|---------|--------------------|--------------------|
| API service unit test coverage | 48% (10/21) | 80% (17/21) | 95% (20/21) |
| API E2E endpoint coverage | ~40% | 65% | 80% |
| Infrastructure (guards/middleware) | 0% | 100% | 100% |
| Frontend utility/hook tests | 0% | 50% | 75% |
| Frontend component tests | 0% | 20% | 40% |
| Frontend page tests | 0% | 5% | 15% |
