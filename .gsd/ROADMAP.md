---
milestone: backend-full-implementation
version: 1.0.0
updated: 2026-10-10T12:20:00Z
---

# Roadmap: PRAGYA AI Backend Implementation

> **Current Phase:** Phase 6 — Frontend Integration & Verification
> **Status:** Completed (All Phases 1–6 Verified)

---

## Must-Haves (from Requirements)
- [x] Production-ready schema with migrations and seed data in SQLite (`node:sqlite` & `better-sqlite3` compatible).
- [x] JWT authentication with bcrypt hashing, role-based authorization (`student` vs `faculty`), and persistent profiles.
- [x] Course and curriculum structure (Courses, Units, Topics, Enrollments) and resource catalog with search.
- [x] Faculty resource lifecycle (Draft, Publish, Edit, Unpublish, Archive), secure file uploads & gated downloads.
- [x] 6 CS game worlds with server-side validation for all challenges (Variables, Conditions, Loops, Packet Routing, etc.).
- [x] Transactional, idempotent student progression (XP, coins, lives, 7-day streak tracking, achievements).
- [x] Question banks, assessments, server-side grading, and privacy-aware leaderboard.
- [x] Pragya AI provider abstraction (Claude / Gemini / local rule engine) with rate limiting and usage tracking.
- [x] CS Battle Cards collection & deck management with unlock levels.
- [x] Complete frontend integration connecting all screens to real API endpoints with robust error and loading states.
- [x] Automated regression tests verifying all security, game logic, and content endpoints (34/34 API tests + 10/10 UI tests PASS).

---

## Execution Phases

### Phase 1: Foundation
**Status:** ✅ Completed
**Objective:** Database schema & migrations (15 tables, relational indexes), seed data, JWT auth, STUDENT/FACULTY RBAC, profile updates, environment configuration, and centralized error handling.
**Verification:** 9 integration tests covering registration, login, token verification, duplicate prevention, and profile/password modification passing.

### Phase 2: Learning Content
**Status:** ✅ Completed
**Objective:** Courses, units, topics, student enrollments, resource catalog search (`/api/vault?q=...`), faculty studio upload/publish/edit/archive lifecycle, and gated file downloads (`/api/files/:id`).
**Verification:** 9 integration tests covering course listing, enrollments, drafts isolation, publication, search, and editing passing.

### Phase 3: Game Backend
**Status:** ✅ Completed
**Objective:** 6 game worlds, level configs, prerequisites, server-side challenge validation, transactional reward processing (XP, coins, lives, streak, level), achievement unlocks, Battle Cards deck management (`/api/cards/deck`), and turn-based battle simulation (`/api/battle/simulate`).
**Verification:** 8 integration tests covering worlds, challenge validation, idempotent anti-farming XP rewards, life loss, battle deck equipping, and RPG battle simulation passing.

### Phase 4: Assessments and Rankings
**Status:** ✅ Completed
**Objective:** Question banks, assessment submission & server-side grading with answer key sanitization, previous exam papers, and privacy-aware student leaderboards.
**Verification:** 4 integration tests covering assessment listing, stripped answer keys, automatic grading, and leaderboard ranking passing.

### Phase 5: Pragya AI Mentor
**Status:** ✅ Completed
**Objective:** AI service abstraction with Anthropic/OpenAI/Gemini provider adapters, fallback contextual mentor, input validation, sliding-window rate limiting (20 req/min), and token/usage audit tracking.
**Verification:** AI mentor tests passing with fallback rule responses, input filtering, and token accounting in `ai_logs`.

### Phase 6: Frontend Integration & Verification
**Status:** ✅ Completed
**Objective:** Connect `public/index.html` frontend screens to real APIs, wire up Battle Cards deck management, add Web Audio API 8-bit chiptune sound synthesis with navbar toggle (`#sndTog`), retro CRT scanlines toggle (`#crtTog`), Knowledge Vault search (`#vq`), interactive assessment quiz modal (`#quizModal`), and verify with automated UI smoke tests (`uitest.js`).
**Verification:** `uitest.js` tests passed (10/10 assertions PASS, page errors: none).
