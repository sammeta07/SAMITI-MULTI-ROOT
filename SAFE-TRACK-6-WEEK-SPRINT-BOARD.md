# Safe Track 6-Week Sprint Board

Date: 2026-07-05
Branch: dev-new-table-str

## Team Roles
- BE Lead: Backend schema, GraphQL resolvers, migration safety
- FE Lead: Angular UI flows and role-based UX
- QA Lead: Test plans, regression suite, release gate
- Integrator: BE-FE contract sync, env validation, release checklist

## Story Point Scale
- 1: Tiny change
- 2: Small
- 3: Medium
- 5: Large
- 8: Complex

## Week 1 - Event Core V1

### Sprint Goal
Enable event create, list, and detail flows with auth guard for committee admins.

### Tickets
| ID | Owner | Points | Task |
|---|---|---:|---|
| W1-BE-01 | BE Lead | 5 | Harden createEvent validation and permission checks |
| W1-BE-02 | BE Lead | 3 | Normalize createEvent error model |
| W1-BE-03 | BE Lead | 5 | Committee-wise events list query with sorting |
| W1-BE-04 | BE Lead | 3 | Event details query with not-found handling |
| W1-FE-01 | FE Lead | 5 | Event create form with validation and submit states |
| W1-FE-02 | FE Lead | 5 | Event list screen with loading/empty/error states |
| W1-FE-03 | FE Lead | 3 | Event detail screen basic layout |
| W1-FE-04 | FE Lead | 2 | Role-based create button visibility |
| W1-INT-01 | Integrator | 2 | Wire create -> list -> detail end-to-end |
| W1-QA-01 | QA Lead | 3 | Smoke suite for event core |

### Exit Gate
- Committee admin can create event from UI.
- Event appears in list and details immediately.
- Unauthorized create is blocked.

## Week 2 - Event Membership Management

### Sprint Goal
Manage event members and event admins from UI with strict permission matrix.

### Tickets
| ID | Owner | Points | Task |
|---|---|---:|---|
| W2-BE-01 | BE Lead | 5 | Add event member API |
| W2-BE-02 | BE Lead | 3 | Remove event member API |
| W2-BE-03 | BE Lead | 5 | Promote to event admin API |
| W2-BE-04 | BE Lead | 3 | Demote/remove event admin API |
| W2-BE-05 | BE Lead | 3 | Members/admins list endpoints |
| W2-FE-01 | FE Lead | 5 | Members tab with add/remove controls |
| W2-FE-02 | FE Lead | 5 | Admins tab with promote/demote controls |
| W2-FE-03 | FE Lead | 3 | User picker/search component |
| W2-INT-01 | Integrator | 2 | Sync updates into hierarchy-dependent views |
| W2-QA-01 | QA Lead | 3 | Membership permissions and regression checks |

### Exit Gate
- Member/admin role changes reflect correctly in event scope.
- Duplicate and unauthorized operations are prevented.

## Week 3 - Event Request Workflow

### Sprint Goal
Introduce event join request lifecycle and audit trail.

### Tickets
| ID | Owner | Points | Task |
|---|---|---:|---|
| W3-BE-01 | BE Lead | 5 | Migration for event_role_requests table |
| W3-BE-02 | BE Lead | 5 | Send request API with duplicate-pending prevention |
| W3-BE-03 | BE Lead | 3 | Pending requests inbox API |
| W3-BE-04 | BE Lead | 3 | My requests API |
| W3-BE-05 | BE Lead | 5 | Approve request API + users_events upsert transaction |
| W3-BE-06 | BE Lead | 3 | Reject request API |
| W3-BE-07 | BE Lead | 2 | Cancel request API |
| W3-FE-01 | FE Lead | 3 | Join request UI action |
| W3-FE-02 | FE Lead | 3 | My request status timeline/chips |
| W3-FE-03 | FE Lead | 5 | Admin inbox with approve/reject controls |
| W3-INT-01 | Integrator | 2 | Verify accept flow updates role visibility |
| W3-QA-01 | QA Lead | 5 | Lifecycle + race-condition smoke tests |

### Exit Gate
- Full request lifecycle works: PENDING -> ACCEPTED/REJECTED/CANCELLED.
- Approval updates final membership mapping atomically.

## Week 4 - Year Model Foundation

### Sprint Goal
Make event model year-aware without breaking existing flows.

### Tickets
| ID | Owner | Points | Task |
|---|---|---:|---|
| W4-BE-01 | BE Lead | 5 | Event master/catalog schema |
| W4-BE-02 | BE Lead | 5 | Yearly event instance schema and keys |
| W4-BE-03 | BE Lead | 5 | Backfill existing events into master+year model |
| W4-BE-04 | BE Lead | 3 | Year-aware create/list/detail resolver updates |
| W4-BE-05 | BE Lead | 2 | Backward compatibility response shaping |
| W4-FE-01 | FE Lead | 3 | Reusable year selector component |
| W4-FE-02 | FE Lead | 3 | Year filter integration on list screen |
| W4-FE-03 | FE Lead | 2 | Year context handling in create/detail screens |
| W4-INT-01 | Integrator | 3 | Cross-year isolation verification |
| W4-QA-01 | QA Lead | 3 | Migration validation + year filter regression |

### Exit Gate
- Same logical event can exist across multiple years safely.
- Existing consumers still work using default year behavior.

## Week 5 - Yearly Clone V1

### Sprint Goal
Enable safe, idempotent clone from previous year into target year.

### Tickets
| ID | Owner | Points | Task |
|---|---|---:|---|
| W5-BE-01 | BE Lead | 3 | Clone API contract + dry-run mode |
| W5-BE-02 | BE Lead | 5 | Ensure/create target-year event instances |
| W5-BE-03 | BE Lead | 5 | Carry-forward accepted member/admin mappings |
| W5-BE-04 | BE Lead | 5 | Program clone with lineage refs |
| W5-BE-05 | BE Lead | 8 | Task deep clone with parent-child remapping |
| W5-BE-06 | BE Lead | 5 | Idempotency and rerun safety |
| W5-BE-07 | BE Lead | 3 | Clone run audit log |
| W5-FE-01 | FE Lead | 3 | Clone wizard UI |
| W5-FE-02 | FE Lead | 3 | Dry-run preview screen |
| W5-FE-03 | FE Lead | 3 | Execute clone and result summary screen |
| W5-INT-01 | Integrator | 3 | Verify rerun does not duplicate data |
| W5-QA-01 | QA Lead | 5 | Clone functional and integrity suite |

### Exit Gate
- Clone run is safe to rerun without duplicates.
- Programs/tasks hierarchy remains intact after clone.

## Week 6 - Election Roles

### Sprint Goal
Deliver yearly election flow for changing event roles.

### Tickets
| ID | Owner | Points | Task |
|---|---|---:|---|
| W6-BE-01 | BE Lead | 5 | Election schema migrations (positions, nominations, votes, results) |
| W6-BE-02 | BE Lead | 3 | Position management APIs |
| W6-BE-03 | BE Lead | 5 | Nomination APIs |
| W6-BE-04 | BE Lead | 5 | Voting APIs with one-vote constraints |
| W6-BE-05 | BE Lead | 5 | Result computation and publish APIs |
| W6-FE-01 | FE Lead | 3 | Position board and phase states |
| W6-FE-02 | FE Lead | 5 | Nomination and voting screens |
| W6-FE-03 | FE Lead | 3 | Results and winner display |
| W6-INT-01 | Integrator | 3 | Year-isolation and role propagation checks |
| W6-QA-01 | QA Lead | 5 | End-to-end election + edge-case suite |

### Exit Gate
- Nomination -> voting -> publish pipeline complete.
- Winners are year-specific and do not overwrite base membership.

## Weekly Capacity and Point Envelope
- Recommended team capacity: 40 to 55 points/week.
- If estimated points exceed capacity, defer lowest-risk FE polish tasks first.

## Daily Standup Checklist
- What was completed yesterday against ticket IDs?
- What is the exact plan for today by ticket ID?
- Any blocker in API contract, schema migration, or env config?
- Any dependency waiting on another owner?
- Any scope change requested since last standup?
- Is release gate for current week still realistic?

## Weekly Release Checklist
- Migration rollback plan reviewed.
- Backward compatibility checks passed.
- QA smoke suite green for current week and previous core flows.
- Demo completed and sign-off captured.
- Next week does not start without current exit gate pass.
