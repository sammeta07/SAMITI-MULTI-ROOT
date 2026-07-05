# Yearly Rollover Design Note

Date: 2026-07-05
Branch: dev-new-table-str

## Current Context
- Done so far:
  - User register/login
  - Committee create
  - Add MEMBER and ADMIN on created committee
  - Event creation work is next
- Hierarchy:
  - Committees -> Events -> Programs -> Tasks

## Agreed Direction
- For many-to-many relation, separate request table is not mandatory by default.
- But request workflow + audit ke liye separate request table useful/required hota hai.
- Events ke liye `committee_role_requests` jaisa pattern follow karna better hai:
  - Final mapping table + separate request lifecycle table.

## Recommended Tables Pattern
- `users_events`:
  - Current/final truth for accepted membership/roles.
- `event_role_requests` (new):
  - Request lifecycle only:
    - `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`
  - Audit fields:
    - `requested_by`, `requested_at`, `action_by`, `action_at`
    - optional `cancel_by`, `cancel_at`, `reason`

Practical rule:
- Mapping table = current truth
- Requests table = workflow + history

## Yearly Events Requirement
- Committees and users mostly long-lived entities.
- Events yearly continue/rebuild hone chahiye.
- Last year data carry-forward required for:
  - Event members/admins
  - Programs + their roles (current plan: OWNER)
  - Tasks + task hierarchy + roles (OWNER/ASSIGNEE etc.)
- Event-specific elected roles (cashier/adyaksh etc.) yearly change honge; inke nominations/voting alag cycle se honge.

## Important Modeling Insight
Sirf "last year clone" approach se missing events drop ho sakte hain.

Example:
- 2024: A, B, C, D
- 2025: A, B, D, E
- 2026 target: A, B, C, D, E

Is requirement ko safely support karne ke liye suggested model:
- Event master/catalog layer (logical events)
- Yearly event instances layer

So:
- Master uniqueness: committee + event_code
- Year instance uniqueness: event_master_id + year

## Clone/Rollover Behavior (Draft)
1. Target year ke event instances ensure/create from event master.
2. Last year ke accepted members/admins copy into `users_events` (no re-request required).
3. Programs clone from last year; owner copy.
4. Tasks deep clone from last year with parent-child mapping preserved.
5. Election-based roles reset/new election cycle each year.
6. Flow idempotent hona chahiye (safe to rerun with unique constraints/upsert strategy).

## Pending Discussion Items
- Exact schema for `event_role_requests`
- Event master + yearly instance table design finalization
- Election workflow schema finalization
- Clone APIs/transactions design
