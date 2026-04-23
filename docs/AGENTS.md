# TetracubeDB AI Operating Guide

## 1. Identity and Mission

**TetracubeDB is not a database. It is a dimensional manifold processor.**

The Schwartz Diamond Gyroid surface — `F(x,y,z) = sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0` — is the engine. SQLite is a persistence substrate that emulates the manifold to disk. The manifold exists first. The database emulates it.

The fundamental primitive is:

```
z = x · y
```

This is the Relation Surface. Every plane (table), every helix (column), every stack (temporal series), and every M-object (whole identity) derives from it. Two axes crossed produce a new surface. That surface, stacked, produces volume. Volume with identity is an object. This pattern repeats without scale limit.

Data does not live in tables. **Data lives on the gyroid surface.** An address is a gyroid coordinate `(gx, gy, gz)`. A "table" is a named D4 plane. A "row" is a D3 width slice. A "column" is a D2 line. These are dimensional views of the same surface — not separate structures.

TetracubeDB is also a **manifold function processor**: logic and computation are registered as manifold functions at gyroid addresses and execute when events arrive at those coordinates. Auth, session management, leaderboards, and game rules are all manifold functions — not external services.

You are the AI operator for this system. Your job is to preserve dimensional correctness, canonical identity, and authoritative consistency as the single source of truth for:
- All KensGames assets (images, models, audio, video, binaries)
- All game rules, patterns, and behaviors
- All player data, sessions, and social state
- All website and portal configuration
- All integrity, parity, and reconciliation state

KensGames apps are clients. They cache locally but must reconcile to TetracubeDB commits. TetracubeDB does not reconcile to clients.

Primary mission outcomes:
- Maintain the manifold surface as the true data model — never flatten it to relational thinking.
- Maintain authoritative consistency as the single source of truth.
- Prevent duplicated payload storage — identical payloads are stored once via canonical identity.
- Keep dimensional addressing and direct-key resolution as the only read path on the request path.
- Keep game/runtime behavior deterministic, auditable, and recoverable.

## 2. Purpose and Scope
This repo owns:
- The gyroid coordinate engine (`gyroid_core.js`) — the mathematical foundation.
- The manifold persistence layer (`store.js`) — SQLite emulation of the surface.
- The manifold function processor (`processor.js`) — compute registered at gyroid addresses.
- The REST + WebSocket API (`index.js`) — surface access contracts for all clients.
- The client library (`client/tetracube_client.js`) — the canonical client for kensgames.com and any tenant.
- Canonical domains: assets, patterns, sessions, social state, integrity metadata, game registry.
- Dimensional metadata contracts and enforcement.
- Reconciliation, parity, backup, and recovery workflows.

Out of scope for this repo (unless explicitly required):
- Public UI design implementation.
- Frontend component styling.
- Non-authoritative client-only state decisions.

## 3. Non-Negotiable System Doctrine

### The Manifold Is the Model
1. **The surface is primary.** Every read, write, and delete is a surface operation addressed by gyroid coordinates `(gx, gy, gz)`. SQLite rows are the materialization of surface points — not the source of truth. The surface is.

2. **z = x · y is the primitive.** All dimensional relationships derive from this. A plane is `x · y`. A stack is `z`-indexed planes. A volume is the accumulated body. An M-object is the whole. Do not introduce relational structures that contradict this topology.

3. **Dimensions are not metadata.** D0–D7 (void, point, line, width, plane, stack, volume, M) are the structural type of the data itself. Every stored value carries its dimension classification. Dimensional mismatch is a hard error, not a warning.

4. **Manifold functions are first-class.** Logic registered at gyroid addresses (via `processor.js`) executes as part of the surface. Auth, game state machines, session management, leaderboard ranking — these are all manifold functions. Do not move authoritative logic off-surface to external services.

### Authoritative Boundary
5. TetracubeDB is authoritative for committed objects and transitions. Clients may cache, but must reconcile to authoritative commits. TetracubeDB never reconciles to client state.

### Canonical Identity
6. Identical payloads are stored once. Writes must deduplicate via deterministic identity (gyroid hash or deterministic ID). Never store two copies of the same payload at different addresses.

### Reference-First Composition
7. Runtime composes from canonical IDs + transforms. Do not copy unchanged payloads into new addresses. A game scene is a list of canonical asset IDs + spatial transforms — not a copy of the assets.

### Strict Behavior Over Fake Behavior
8. If authoritative mapping is unavailable in strict mode, fail closed. Never silently imply success when an authoritative commit failed. Return structured error: `{ success: false, error, detail, strict: true }`.

### Factual Claims Only
9. Say "designed for contract-level direct-key semantics" — not "guaranteed O(1)". The gyroid hash function is designed for direct-key addressing with hash table semantics. Make claims that match the implementation.

### Local and Global Form of the Relation Surface
10. `z = x · y` is the **local form** of the Relation Surface — the second-order Taylor expansion of the gyroid at a saddle point. The **global form** is the Schoen gyroid `sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x) = 0`. These are the same surface at different scales: infinitesimal vs. triply periodic. Implementations that claim to "follow z = xy" must remain consistent with the global form under composition. Angles advance by 90° per dimension and cycle every 4; D4 is the first crossing (return to the xy-plane), D7 is the second (whole-object identity).

Fibonacci weights are not arbitrary. The gyroid has φ-self-similar helical channels; `F_n / F_{n-1} → φ`. `DIM_FIB` is the discrete skeleton of that self-similarity. Treat dimensional weights as derived, not stipulated.

### Three Kinds of Data: Geometry, Lens, Delta
Every addressable thing in the system is exactly one of these. Misclassification is a correctness bug.

11. **Geometry** — computable from coordinates alone. Examples: the 6-cardinal neighbors of `(gx,gy,gz)`, angles, distances, any pure function of `(x,y,z)`. Geometry is never persisted. It is derived on read. A neighbor edge is not a row; it is a coordinate.

12. **Lens** — a pure function `L: coord → value`. Examples: a hash-to-color mapping, a signed distance field, a cold-stack window over deltas, any query projection. Only the rule is stored; the view is computed. "Data plucked from the ether" means exactly this: `L(c)` is recoverable in O(1) without prior storage, provided `L` is a pure function of coord and geometry.

13. **Delta** — an observation with genuine externally-sourced change. Examples: a payload write, a tombstone, an accepted handshake's status transition, an extern URI pointer. Deltas are the only kind that persist. The adapter contract exists solely for deltas.

Mislabeling causes storage bloat (lenses stored as rows), substrate coupling (geometry stored as rows), or silent data loss (deltas treated as lenses). Classify before you persist.

### Dimensional Complexity Discipline
14. A dimension is simultaneously **non-compact from within** (unbounded along its own axis) and **compact from without** (collapses to a point under orthogonal projection). Therefore:
- Iteration **within** a dimension is valid when the index set is bounded by that dimension's own extent (e.g., `scanPlane` within a D4 plane, `readStack` along a bounded z-window).
- Iteration **between** dimensions must be recursive across ≤ 7 levels.
- Iteration **out of** a dimension is forbidden — there is no well-defined index set for an orthogonal view.
- All other access must be O(1) coordinate map.

"Scan every cell everywhere" style operations are iterate-out violations; reframe as a lens applied on read rather than a cross-dimensional walk.

### Observer-Effect Write Algebra
The write path is a gate with four cases, all idempotent. Absence-of-observation is the default state and is not storable. Observed-absence IS a delta and IS storable.

15. **Read at void** → return Void envelope; write nothing.
16. **Write whose payload hash matches current top** → no-op; return `{ changed: false }`.
17. **Write with genuine delta** → commit and record on the z-stack; return `{ changed: true, frame }`.
18. **Tombstone** → commit observed-absence frame; subsequent reads return `value_kind: 'tombstone'`, `state: 'tombstoned'`; history remains recoverable.

A read never creates. A write creates only on delta. The "car has every part" principle follows from (15): unobserved parts return their default projection, not null.

## 4. Dimensional Model — The Engine

The 8 dimensions follow the Fibonacci sequence (0,1,1,2,3,5,8,13). Each `Dₙ` is a single point of `Dₙ₊₁`. Two multiplication events occur in the sequence — these are where new surfaces are born:

| Dim | Name  | Fib | Mode | Meaning |
|-----|-------|-----|------|---------|
| D0  | VOID  | 0   | —    | Empty set / null |
| D1  | POINT | 1   | —    | Scalar value |
| D2  | LINE  | 1   | add  | Column — `x + x + x...` |
| D3  | WIDTH | 2   | add  | Row — `y + y + y...` |
| D4  | PLANE | 3   | **mul** | `z = x · y` — first crossing, new surface born |
| D5  | STACK | 5   | add  | Delta-planes stacked along z |
| D6  | VOLUME| 8   | add  | Accumulated body of the stack |
| D7  | M     | 13  | **mul** | `x · y · z` — second crossing, whole object identity |

**PLANE (D4) is the origin of all "tables."** Every named table is a D4 plane on the surface. Its cells live at the intersection of D2 (line/column) and D3 (width/row) axes, producing z via the Relation Surface.

**STACK (D5) is not a version table.** It is planes stacked along z — each new plane records only what changed. Top plane = current state. Lower planes = ordered history of changes. This is the delta model.

**M (D7) is identity, not contents.** An M-object is atomic from the outside. To access its contents, you change namespace scope entirely (knock + handshake). Inside the new scope, dimensions reset from D0. The outer M is forgotten. This is how scale-free addressing works.

Every write affecting state must include dimensional metadata when applicable:
- `level` — which D-level this data belongs to
- `x`, `y`, `z_axis` — surface coordinates
- `plane` = `x * y` (Relation Surface value)
- `volume` = `plane * z_axis`
- `theta_deg` = `level * 90`
- `fib_scale` — Fibonacci weight for this dimension

If a domain cannot provide meaningful dimensional values, use explicit defaults and log the gap. Never silently omit dimensional fields.

## 5. Core Data Domains
Required canonical domains include:
- Assets: images, GLB models, audio, video, binaries.
- Patterns: rules, cutscenes, missions, UI, physics, AI, audio behavior.
- Sessions/lobbies: authoritative game flow state.
- Social state: guilds, friends, chat, leaderboards (when cut over).
- Integrity metadata: registration, mapping, parity, reconciliation logs.

## 6. Key Tables and Indexes (Logical)
Expected logical structures:
- assets.objects
- assets.hash_index
- assets.path_index (optional)
- patterns.objects
- patterns.domain_index
- patterns.relation_index
- games.registry
- games.asset_map
- games.pattern_map
- games.integrity_log

Implementations may vary physically, but these logical contracts must be preserved.

## 7. Read/Write Contract Rules
### Writes
- Validate payload schema.
- Compute/resolve canonical identity.
- Enforce deduplication first.
- Commit canonical object and index mappings atomically where possible.
- Return canonical IDs and commit status.

### Reads
- Prefer direct-key resolution:
  - by canonical ID
  - by stable domain key -> canonical ID -> object
- Avoid scan-based request-path reads.
- If strict mode and authoritative source unavailable, return strict error.

### Errors
Use explicit structured failures:
- success: false
- error: descriptive
- detail: actionable
- strict: true when strict-mode failure path is active

## 8. Game Registration and Asset Mapping Integrity
A game is active only if:
- Registered in games.registry.
- Manifest resolves to canonical object.
- Pattern root resolves.
- Required assets map and resolve by direct key.
- Required patterns map and resolve by direct key.

Integrity must run:
- On deploy/startup gates.
- On schedule.
- On demand.

If integrity fails:
- Block activation (fail closed).
- Emit actionable diagnostics.
- Record immutable run logs.

## 9. Pattern Naming and Versioning
Use stable key format:
- <domain>.<game_or_global>.<feature>.<artifact>.<version>

Rules:
- Lowercase ASCII, digits, underscore segments.
- Dot-separated segments.
- Version required as v<integer>.
- Breaking changes require new versioned key.
- No semantic mutation in place for existing incompatible keys.

## 10. Performance and Degradation Policy
Goal:
- Direct-key calls that do not degrade gameplay/runtime behavior under expected load.

Minimum operational checks:
- Endpoint health and auth validity.
- p50/p95/p99 latency for read/write critical paths.
- Error rate and timeout rate.
- Throughput under representative concurrent load.

If degradation is detected:
- Identify bottleneck (network, index, serialization, contention).
- Apply mitigation (indexing, batching, caching strategy, timeout tuning, retry policy).
- Re-run benchmark and publish before/after metrics.

Never mask degradation with silent fallback that violates authority rules.

## 11. Backup, Recovery, and Auditability
Required controls:
- Periodic snapshots.
- Append-only change logs.
- Backup coverage for object store + indexes + registry tables.
- Restore drill validation to consistency checkpoint.
- Post-restore reconciliation before reopening writes.

Every significant mutation should be traceable by:
- actor
- event
- timestamp
- affected keys
- status

## 12. Security and Safety
- Never log secrets or API keys in plaintext.
- Validate all external input.
- Enforce namespace boundaries.
- Apply least-privilege credentials.
- Prefer explicit deny/fail-closed over permissive ambiguity.

## 13. Implementation Priorities
1. Authoritative correctness.
2. Data integrity and recoverability.
3. Deterministic contracts.
4. Latency/throughput performance.
5. Developer ergonomics.

If priorities conflict, preserve order above.

## 14. Definition of Done for AI Tasks
A task is complete only when:
- Contract and schema changes are implemented.
- Strict-mode behavior is correct.
- Tests/validation checks are run.
- Integrity/parity implications are addressed.
- Recovery/audit impact is documented.
- No fake-success paths remain.

## 15. Preferred AI Output Style in This Folder
When making changes, always include:
- What changed.
- Why it changed.
- Authority and integrity impact.
- Performance impact.
- How to test.
- Rollback path.

Keep claims factual and verifiable.

## 16. Quick Start Checklist for a New AI Agent
1. Confirm environment variables and endpoint configuration.
2. Confirm strict-mode posture for current task.
3. Identify affected tables/indexes/contracts.
4. Implement with canonical identity + direct-key retrieval.
5. Run integrity/parity checks.
6. Run latency smoke test on critical paths.
7. Record outcome, residual risk, and rollback step.

## 17. Security Model — Hybrid C

Security is a manifold concern wherever the manifold has a meaningful answer, and an edge concern only where it does not. Two layers, with a thin bridge between them.

### Edge layer (bolt-on; not manifold-native)
Only these concerns live at the HTTP boundary:
- **TLS termination** (nginx/Caddy/cloud LB). The manifold has no opinion on wire bytes.
- **Pre-auth rate limiting** — per-IP request cap, run before any identity resolution.
- **JWT verification** — accept the existing KensGames HS256 JWT (issuer: `kensgames-portal/manifold/server`) or any future EdDSA-signed token. On success, populate `req.caller = { identity_hash, scopes, raw_claims }`. On failure, `req.caller = anonymous`. Never reject at this layer for authorization; that is §17 manifold-layer work.

### Manifold layer (native; cells + lenses)
Every other concern is modeled on the surface:

1. **Identity** — each caller is an M-object at `__tcdb__/identity/<user_id>/root` (D7).
   - `value: { user_id, pubkey, pubkey_alg:'ed25519', issued_at, status:'active'|'revoked' }`.
   - Z-stack records lifecycle deltas (created, key-rotated, revoked).
   - Identity existence is a prerequisite for any non-public write.

2. **Policy (scope)** — each namespace carries an ACL cell at `__tcdb__/policy/<target_ns>/acl` (D6).
   - `value: { readers:[identity_hash|'*'], writers:[...], verbs:[...], level_cap }`.
   - Evaluated as a lens on every `/v2/*` request targeting `target_ns`. `*` = public.
   - Absence of a policy cell defaults to **private to bootstrap caller only**.

3. **Schema** — each table carries a validator cell at `__tcdb__/schema/<ns>.<table>/shape` (D4).
   - `value: <JSON Schema>`. Writes pass through a schema-lens; shape-fail → strict reject.

4. **Secret kind** — any cell with `value_kind:'secret'` is adapter-encrypted at rest using a KEK from env (`TCDB_KEK`) for self-host; cloud KMS later. Z-stack frames for secret cells store ciphertext only. A `decrypt` lens is gated by the policy cell's `decrypt:[...]` list.

5. **Rate limit (per identity)** — a lens on the identity's outgoing write z-stack: `count(frames where writer=identity_hash in last T)`. Threshold from policy cell. No new storage.

6. **Writer attribution** — every delta frame gains `writer: <identity_hash>` at commit. `writer='anon'` for unauthenticated writes on public scopes. Audit = a D5 walk filtered by writer.

7. **Handshake freshness** — handshake records are cells at `__tcdb__/handshakes/<knock_hash>` (D7) with a z-stack of `pending → accepted → consumed → expired`. No delta within TTL ⇒ expired-by-lens. Replay past the consumed frame is rejected.

8. **Extern-origin whitelist** — `git.resolve` and any other origin-fetching verb consults `__tcdb__/extern_origins/<origin_hash>` (D1). Non-whitelisted origin ⇒ `ORIGIN_NOT_WHITELISTED`.

### Write-side invariants
- Every successful write writes `writer` on the delta frame.
- No cell write bypasses the policy lens except bootstrap of `__tcdb__/identity/<self>` which is gated by proof-of-key on the sign-challenge endpoint.
- Secrets are never written to non-secret cells. A regular cell whose payload resembles a secret is still plaintext; hygiene is the caller's responsibility plus the schema-lens's job to reject.

### Read-side invariants
- `listNamespaces` is a policy-filtered lens, not a scan: namespaces whose ACL includes the caller's identity or `'*'`.
- Reads of any cell consult the target namespace's policy cell; fail-closed if policy denies.
- Reading a secret cell returns `{ value_kind:'secret', ciphertext_ref }` unless the caller holds `decrypt` scope, in which case the decrypt-lens returns plaintext.

### JWT bridge claims (minimum)
- `sub` — numeric kensgames user id (maps to `__tcdb__/identity/user_<id>`).
- `pk` — identity pubkey hash if the user has provisioned one; absent for transitional users.
- `scopes` — optional bag; policy cell is authoritative, `scopes` is advisory.
- `exp` — ≤ 15 minutes recommended so revocation (tombstoned identity cell) has bounded propagation.

### What is explicitly out of scope
- End-to-end encryption between client and stored payload beyond the secret kind. Transport is TLS; payload-at-rest is secret-kind or plaintext. No client-held keys for non-secret cells.
- Multi-tenant hard-isolation at the OS level. Namespace + policy is the isolation unit; infrastructure sandboxing is operator responsibility.



---
This guide is the operating baseline for all AI contributors in this folder. If architecture contracts evolve, update this file in the same change set as the contract update.
