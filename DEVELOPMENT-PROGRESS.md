# Enterprise Upgrade Progress Ledger

> Updated: 2026-08-11 (Asia/Shanghai)  
> Execution policy: code implementation only; no deployment. Use focused tests, no interactive commands, and no full test suite.


## Enterprise AI Agent platform capability sprint (9/9 complete)

This sprint productized the nine requested AI platform stages as runnable, tenant-scoped capabilities. Every write path is persisted, authenticated and governed; no deployment was performed.

1. **Baseline audit and focused verification** - reconciled existing runtime, Skill, knowledge and enterprise-page contracts before changes.
2. **Visual workflow orchestration** - delivered a draggable DAG canvas, immutable published versions, cycle checks, governed Skill nodes, durable runs/events and linkage to official Agent tasks.
3. **Skills, plugins and MCP** - unified eight immutable Skills with declarative plugins, real JSON-RPC MCP discovery/calls, SSRF protection, credential references, probes and invocation evidence.
4. **Knowledge base and vector retrieval** - delivered ACL-scoped hybrid lexical/vector/graph/authority retrieval, inspectable contribution scores and a no-raw-query audit path.
5. **Multi-Agent collaboration office** - merged persisted Agent dialogue, handoffs, human notes, deliverables, evidence and acceptance decisions around authoritative runtime tasks.
6. **Knowledge graph** - delivered evidence-backed neighborhoods, shortest explainable paths, source/confidence inspection and a governed candidate review queue.
7. **Governed self-evolution** - connected real failure/feedback signals to fixed benchmark datasets, baseline/candidate retrieval Evals, safety and quality gates, human release approval, live production ranking and one-click rollback.
8. **Digital twin and multimodal federation** - built real business snapshots, deterministic scenario simulation, governed recommendation dispatch, private multimodal object storage, technical inspection, human evidence review, minimum aggregation, privacy ledger, deterministic Laplace protection and Ed25519-signed contributions.
9. **Canonical integration and dynamic acceptance** - reset all showcase data, verified cross-module APIs and persistence, checked no-code user pages, executed real Chrome interactions and preserved visual/browser evidence.

### Platform sprint acceptance evidence

| Gate | Result |
|---|---|
| New migrations | `0009`-`0013`; 4 workflow + 6 extension + 3 collaboration + 6 evolution + 12 twin/federation tables, all RLS protected |
| Workflow | 2 published workflows; governed Agent task linkage; migration 20 and API 14 assertions |
| Skills/plugins/MCP | 8 Skills, 1 published plugin, 1 active MCP server and 3 discovered/callable tools; migration 21 and API 15 assertions |
| Knowledge/vector/graph | 10 documents, 10 indexed chunks, 30 entities and 15 evidence-backed relations; vector 13 and graph 20 focused assertions |
| Multi-Agent office | Canonical three-Agent room with persisted handoffs, three deliverables and evidence; migration 15 and API 13 assertions |
| Governed evolution | 6 fixed cases, real baseline/candidate retrievals, 100% safety gate, human release and rollback; migration 24 and API 21 assertions |
| Digital twin/multimodal/federation | Real business snapshot, modeled risk reduction, 8 private assets, 3 signed nodes and zero raw federation records; migration 38 and API 25 assertions |
| Cross-module integration | 10 integrated APIs, 8 no-code capability pages and canonical persistence; 41 assertions |
| Legacy enterprise regression | 10 business domains, governed scenario preview and four core pages; 32 assertions |
| Browser acceptance | Chrome 151, five critical workspaces, real twin and federation actions, 3/3 signatures, 0 warnings and 0 exceptions |
| Static quality | Focused TypeScript and ESLint gates passed |

The federation preview truthfully reports one local production-data adapter, two isolated sandbox adapters and zero remote production-school nodes. Multimodal ingestion and technical analysis are real; unconfigured vision/speech semantic inference is never fabricated. Production cross-school trust onboarding, high availability and remote deployment remain environment/infrastructure work rather than hidden page claims.

## AI-5 trusted knowledge and GraphRAG sprint (6/6 complete)

This sprint replaces the former knowledge showcase page with a tenant-isolated, versioned and citation-verifiable knowledge platform. It is locally runnable against PostgreSQL and DeepSeek; no deployment was performed.

1. **Baseline and capability audit** - reconciled the V2 AI-5 gates, passed the White Ze/API and enterprise-page baselines, and confirmed that the local PostgreSQL instance initially had no knowledge tables or pgvector extension.
2. **Governed knowledge persistence** - applied migration `0008_enterprise_knowledge_rag.sql` with 12 RLS-protected tables for bases, documents, versions, chunks, ACL grants, ingestion jobs, entities, mentions, relations, retrievals, citation items and audit events.
3. **Real ingestion and version governance** - delivered text/Markdown upload, stable external document keys, automatic version creation, source hashes, section-aware chunking, full-text indexes, 128-dimensional local feature vectors, archive/restore and an AI-operations workbench.
4. **Hybrid retrieval and governed graph** - combined PostgreSQL full-text/trigram ranking, auditable array-cosine vectors, source authority and published graph expansion. DeepSeek may create evidence-backed graph candidates, but only human-approved relations enter GraphRAG.
5. **White Ze trusted RAG** - routed policy/material/process questions to permission-pruned evidence, enforced inline citation labels, preserved model evidence, refused unsupported institutional questions and stored only query/answer hashes plus lineage rather than raw questions or answers.
6. **Enterprise corpus and dynamic acceptance** - seeded 10 real-world policy/runbook assets, 10 current chunks, 30 published entities and 15 reviewed relations across campus activity, student status, repairs, visitors, dorm safety, energy, notifications, classrooms and AI operations. Browser acceptance verified a live DeepSeek answer and a data-driven graph with zero warnings and zero runtime exceptions.

### AI-5 acceptance evidence

| Gate | Result |
|---|---|
| Knowledge migration | 12 tables, RLS, `pg_trgm` and cosine function; 40 assertions |
| Ingestion/version API | Publish, new version, archive, restore and tenant read; 11 assertions |
| Hybrid retrieval/ACL | Tenant citation, restricted denial, role allowance, refusal and terminal audit; 17 assertions |
| Graph governance | Real DeepSeek extraction, evidence validation, human approval and model ledger; 8 assertions |
| White Ze RAG routing | Citation/model evidence, strict refusal and no task mutation; 11 assertions |
| Canonical knowledge corpus | 10 documents, 10 chunks, 30 entities, 15 relations and live GraphRAG; 18 assertions |
| Focused regression | Original White Ze 21, enterprise showcase 22 and enterprise pages 32 assertions passed |
| Browser acceptance | Live login/search/model answer/graph interaction; 0 warnings, 0 exceptions |
| Static quality | TypeScript and focused ESLint passed |
| Final delivery hygiene | Migration 0001-0008 no-op verified; three AI pages returned 200; ai_ops read-only metrics matched 10/10/30/15; 0 key literals outside .env.local; 0 placeholders; temporary browser assets removed |

The local database does not provide the pgvector extension, so the implemented vector path is truthfully reported as PostgreSQL `real[]` cosine over deterministic Chinese n-gram features rather than pgvector ANN or neural embeddings. The service contract and lineage fields are designed for a later pgvector/neural-embedding backend without changing user-facing citation semantics.

## Governed DeepSeek and real-time Agent execution sprint (5/5 complete)

This sprint turns the White Ze experience from a governed deterministic foundation into a real, server-side model-assisted and event-driven Agent system. Model output remains advisory: PostgreSQL facts, immutable Skills, authorization, human approval, business write-back and read-back verification stay authoritative.

1. **Security baseline and model boundary** - kept the credential only in ignored server environment configuration, removed legacy direct-provider calls, added input limits/redaction and confirmed zero exact key literals outside `.env.local`.
2. **Governed DeepSeek gateway and audit ledger** - delivered tenant/task call budgets, route enforcement, HTTPS host allowlisting, timeout/retry, fail-closed behavior, hashed prompt/response evidence, token/latency/status tracking and migration `0007_deepseek_model_gateway.sql`.
3. **White Ze model-assisted work** - connected real DeepSeek calls to source-backed business Q&A, general Q&A, advisory task understanding and final human-language aggregation. The model cannot change Skills, parameters, permissions, approvals or verified business writes.
4. **Durable live Agent constellation** - added authenticated tenant-scoped SSE from persisted task versions/messages and made the full-screen constellation show real dispatch, handoff, execution, result, verification and aggregation. The catch-up animation only presents already-persisted events; it never fabricates progress or delays backend work.
5. **Dynamic acceptance and canonical reset** - executed a real three-Agent browser flow through approval, three business adapters and three verified effects; captured waiting/live/completed frames, recorded zero browser warnings and zero runtime exceptions, then restored the canonical four-task showcase.

### Sprint acceptance evidence

| Gate | Result |
|---|---|
| Database model ledger | Migration `0007` applied and verified; raw prompts, raw responses and credentials are not stored |
| Real provider probe | Passed against DeepSeek; configured alias `deepseek-chat`, provider-reported model `deepseek-v4-flash` |
| Governed runtime + APIs | 239 focused assertions passed across runtime, assistant, operations, SSE, showcase, pages, scenarios and APIs |
| Live event contract | Passed with advancing durable versions, active lifecycle evidence, terminal state and verified effects |
| Dynamic browser acceptance | 3 Agent nodes, 3 verified business effects, 0 warnings, 0 runtime exceptions |
| Static typing | TypeScript passed after the live-event catch-up refinement |
| Secret/placeholder scan | 0 exact key literals outside `.env.local`; 0 triple-question-mark placeholders |

## Enterprise productization sprint (6/6 complete)

This sprint replaced the remaining prototype-like shell with an enterprise-operable product experience backed by tenant-scoped PostgreSQL records, governed Agent execution, auditable effects and browser-verified interfaces. No deployment was performed.

1. **Audit and focused baseline** - reconciled current AI/runtime capabilities and passed the related baseline tests before changing pages.
2. **Explainable enterprise showcase data** - added a repeatable, isolated showcase seed with 56 people, 5 buildings, 18 repair orders, 10 classrooms, 8 notifications, 247 delivery records, 12 lost-property records, 4 dormitories, 8 safety events, 10 hygiene inspections, 12 visitor applications, 5 energy assets/60 readings, 12 material categories and 14 duty schedules.
3. **Professional information architecture** - replaced fragmented legacy navigation with the White Ze command center, real business-operation workspaces, governance workbenches and a dedicated AI operations administrator entry. Obsolete routes now redirect to their supported replacements.
4. **AI and business cockpit productization** - delivered the enterprise Agent overview, scenario orchestration, and tenant-safe operational cockpits for repairs, classrooms, notifications, dormitory/safety, hygiene, visitors, energy, lost-property, duties and materials. User pages expose business language rather than JSON or code.
5. **Runnable interaction and live replay** - connected real business record selectors, browser voice wake/input, governed approval, multi-Agent fan-out, persisted handoffs, verified effects and White Ze's natural-language aggregation to full-screen mission control.
6. **Focused regression and visual acceptance** - restored the canonical four-task showcase, passed 225 focused assertions plus TypeScript verification, and accepted five critical pages in Chrome with zero warnings and zero runtime exceptions.

### Sprint acceptance evidence

| Gate | Result |
|---|---|
| Database migration | `0006_enterprise_operations.sql` applied/verified |
| Governed AI runtime | 62 assertions passed |
| AI task/API contract | 44 assertions passed |
| AI operations administration | 19 assertions passed |
| White Ze assistant API | 21 assertions passed |
| Showcase data integrity | 22 assertions passed |
| Enterprise pages/read models | 32 assertions passed |
| Four flagship scenarios | 25 assertions passed |
| Static typing | TypeScript passed |
| Browser acceptance | 5/5 pages, 0 warnings, 0 exceptions |

The canonical showcase ends with exactly four governed tasks: two verified, one awaiting explicit human approval and one safely cancelled without forbidden business writes. The flagship forum task contains three persisted Agent nodes and five verified business effects.

## Progress counts

| Scope | Completed | Total | Status |
|---|---:|---:|---|
| Current platform capability sprint | 9 | 9 | Complete; all requested local capability modules and dynamic acceptance gates passed |
| Current AI-5 trusted knowledge/GraphRAG sprint | 6 | 6 | Complete; versioned corpus, ACL retrieval, citations, graph review and dynamic acceptance passed |
| Prior DeepSeek + real-time execution sprint | 5 | 5 | Complete; real provider, durable SSE events and dynamic 3-Agent acceptance passed |
| Prior enterprise productization sprint | 6 | 6 | Complete; data, pages, real interactions and visual acceptance passed |
| Official V2 roadmap phase gates (P0-P6) | 0 | 7 | P0 foundation and prioritized P2 AI kernel are in progress |
| Official V2 release bands (R1-R4) | 0 | 4 | R1 is in progress |
| AI-priority implementation stages | 3 fully gated + AI-4/AI-5 substantial | 7 | Governed provider and trusted local GraphRAG are real; multi-provider Evals, OCR/neural ANN and AI-6/AI-7 deep gates remain |
| P0 foundation work packages fully gated | 2 | 8 | Packages 3 and 4 in progress |
| Stage A: all-role demo identity and login | 6 | 6 | Complete |
| Stage B-1: identity and organization foundation | 8 | 8 | Complete |
| Canonical system-role coverage | 14 | 14 | Complete, including the dedicated AI operations administrator |
| Canonical role Agent-team coverage | 14 | 14 | Complete |
| Prior core implementation stages | 7 | 7 | Complete; all planned local product acceptance gates passed |
| Current page-first transformation stages | 5 | 5 | Complete; pages, AI operations role, full-screen runtime and focused acceptance passed |

## Current page-first transformation stages (5/5 complete)

1. **Baseline audit and focused regression** - reconciled the existing AI kernel and ran only related runtime, repository, Skill and identity checks.
2. **AI operations administrator** - added the fourteenth role, tenant-wide AI observation/recovery/configuration access, persistent runtime settings, diagnostics and feedback governance.
3. **AI-4 through AI-7 runnable pages** - delivered model routing/budget, governed knowledge/memory, feedback/learning and multimodal/ecosystem pages; all user pages avoid code/JSON presentation.
4. **Full-screen White Ze mission control** - replays persisted commands, decomposition, approval, handoff, real Agent execution, business read-back and natural-language aggregation with live node/beam state.
5. **Polish and targeted acceptance** - upgraded the AI landing experience, passed 12/12 AI page smoke checks, 2/2 AI-operations-role page checks and focused backend regression.

## Prior core implementation stages (7/7 complete)

1. **Stage 1: Audit and implementation inventory** - reconciled planning materials, roles, business domains and data flows.
2. **Stage 2: Unified AI product contract** - unified task, Agent team, Skill, governance and business-state view models.
3. **Stage 3: AI workspace** - delivered the assistant, the original 13 role Agent teams, Skill center, team workspace and conversation workspace.
4. **Stage 4: Execution and governance** - delivered decomposition, member dispatch, approval, execution, verification, audit, Outbox, recovery and reporting.
5. **Stage 5: Business entry upgrade** - connected eight business pages to tenant-safe real data read models and removed obsolete AI pages/APIs.
6. **Stage 6: Real local adapters** - initialized isolated local PostgreSQL and connected runtime, Skill Gateway, eight business write/read-back loops and identity scope services.
7. **Stage 7: Targeted acceptance** - passed TypeScript, targeted ESLint, identity, AI/API, migration, recovery, adapter and 14-page preview smoke checks.

## White Ze assistant upgrade stages (7/7 complete)

1. **Visual engine** - code-native Eastern cyber-spirit SVG with translucent glaze, flowing knowledge streams, dual horns, third eye, tail and adaptive mood palettes.
2. **Desktop companion** - global floating White Ze entry, calm/busy/alert/focus/offline/success states, low-noise panel and reduced-motion support.
3. **Real assistant routing** - authenticated `/api/ai/assistant` answers tenant-scoped business questions from PostgreSQL and routes executable requests to the existing governed runtime.
4. **Fractal fan-out** - multi-Skill plans persist multiple Agent nodes, select role members, prepare one Preview per node and aggregate approval/effects.
5. **Live constellation and full-screen mission control** - renders actual node state, moving handoff beams, persisted dialogue, lifecycle progress, approval policy and verified effects; replay metrics advance with the persisted work record.
6. **Companion interaction** - task-count monitoring, focus mode, voice capability detection and real browser SpeechRecognition with an explicit White Ze wake phrase; unsupported browsers fail honestly.
7. **Product integration and acceptance** - the global entry, AI workspaces and eight business Agent panels use White Ze; commands, handoffs and business outcomes are presented in natural language with focused API, runtime, TypeScript, ESLint and browser checks.

White Ze now combines deterministic governed routing, real PostgreSQL business adapters and trusted RAG with server-side DeepSeek assistance for source-backed answers, task intent and final aggregation. Knowledge answers are ACL-pruned, citation-verified and hash-audited; unsupported institution-specific questions are refused. Model routing, budgets, token/latency/hash evidence and fail-closed behavior remain persistent; no provider response, citation or runtime event is fabricated.

## Official V2 roadmap phases (0/7 fully complete)

1. **P0 - Security containment and trustworthy baseline.**
2. **P1 - Real business operating system.**
3. **P2 - Enterprise Agent OS core.**
4. **P3 - Cognitive data and knowledge platform.**
5. **P4 - Self-evolution and advanced decision support.**
6. **P5 - Multi-school and frontier infrastructure.**
7. **P6 - Flagship production scale and ecosystem.**

A phase is counted complete only when every acceptance gate in that phase is met. Existing identity work and the new AI kernel are real completed work packages, but they do not make P0 or P2 fully complete yet.

## AI-priority implementation stages (3 fully gated; AI-4 and AI-5 substantially implemented)

| Stage | Deliverable | Status |
|---|---|---|
| AI-1 | Trustworthy coordinator kernel: runtime contract, 14 role teams, planning, server policy, preview/approval, member distribution and aggregation contract | **Complete** |
| AI-2 | Durable task persistence, event/outbox records, idempotency, leases, retries and restart recovery | **Complete** |
| AI-3 | Skill Gateway, Prepare/Preview/Approve/Revalidate/Commit/Verify, real eight-loop adapters, UI integration and real-database acceptance | **Complete** |
| AI-4 | Model Gateway, governed routing, budgets, Trace, cost ledger and Evals | **Real governed DeepSeek calls, route/call budgets, live diagnostics and token/latency/hash audit complete; multi-provider portability, full rate-card cost governance and repeatable Evals pending** |
| AI-5 | Governed knowledge, citations, context/memory, Hybrid RAG and GraphRAG | **Versioned ingestion, ACLs, full-text + local feature-vector hybrid retrieval, citation verification, graph candidates/human publication, GraphRAG and White Ze integration complete locally; OCR, neural embeddings/pgvector ANN, Neo4j community summaries and large-scale quality Evals pending** |
| AI-6 | Feedback learning, evaluation-driven improvement, causal analysis, RL sandbox and digital twin | **Governed signal collection, fixed-dataset Evals, human-approved release/rollback and real-data digital-twin MVP complete; advanced causal discovery and guarded RL research remain** |
| AI-7 | Multimodal, federated/multi-school Agent network, resilience and flagship scale | **Private multimodal evidence pipeline, signed local/sandbox federation, k-threshold and privacy ledger complete; remote production-school onboarding, semantic vision/speech models and HA scale remain** |

## AI-1 acceptance

| # | Deliverable | Status | Evidence |
|---:|---|---|---|
| 1 | V2 task lifecycle and guarded transition graph | Complete | RECEIVED through approval, execution, observation, verification and terminal states are typed and transition-checked. |
| 2 | Assistant plus Agent team for every canonical role | Complete | 14/14 role team cards, White Ze coordinators and spirit-persona member capability/skill cards. |
| 3 | Governed planner contract | Complete | Goal, assumptions, completion criteria, dependency nodes, schemas, risk, approval policy, retry and budgets. |
| 4 | Server-side authentication and policy | Complete | AI routes no longer trust client-provided roles; anonymous access and student dispatch are denied. |
| 5 | Safe write preview and approval | Complete | High-risk tasks stop at AWAITING_APPROVAL; rejection cancels every pending node without side effects. |
| 6 | Member dispatch, observations, aggregation and verification contract | Complete | Runtime owns node state; business-tool results and read-back observations are required before COMPLETED. |
| 7 | Fail-closed local behavior | Complete | Missing business backend returns FAILED/BUSINESS_BACKEND_UNAVAILABLE and never fabricates completed nodes. |
| 8 | AI secret containment | Complete | Removed the hard-coded DeepSeek credential; model calls now require environment configuration. |

The local preview now uses an isolated local PostgreSQL 15 cluster on 127.0.0.1:55432 through `.env.local`; no external deployment was performed. AI-2 provides the durable repository, additive SQL migrations and atomic persistence/recovery functions. The local integration tenant is seeded with 14 active demo identities, 25 role-skill bindings and real domain fixtures.

## AI-2 acceptance

| # | Deliverable | Status | Evidence |
|---:|---|---|---|
| 1 | Durable runtime schema | Complete | 12 tables for task runs, nodes, dependencies, observations, messages, approvals, tool calls, business effects, trace, audit and outbox. |
| 2 | Atomic persistence contract | Complete | Seven Service Role-only RPCs create/update snapshots, projections, audit and outbox events transactionally. |
| 3 | Production/development repository boundary | Complete | Production requires Supabase Service Role; development uses the same repository contract with isolated process-local storage. |
| 4 | Idempotency and optimistic concurrency | Complete | Tenant/user idempotency keys, conflicting-key rejection and version-checked updates. |
| 5 | Durable orchestration checkpoints | Complete | Task creation, preview, approval, start, node start/completion, verification and terminal states persist with outbox events. |
| 6 | Worker leases and heartbeat | Complete | Claim uses SKIP LOCKED semantics, unique lease tokens, expiry and heartbeat renewal. |
| 7 | Retry and dead-letter policy | Complete | Explicit retry eligibility, exponential backoff, bounded attempts and versioned dead-letter transitions. |
| 8 | Restart recovery | Complete | Interrupted nodes reset safely, plan/policy/preview are revalidated, task is requeued, and only system administrators may trigger recovery. |

## AI-3 backend and product acceptance (complete)

| # | Deliverable | Status | Evidence |
|---:|---|---|---|
| 1 | Eight immutable enterprise Skill contracts | Complete | Eight independent `v1` contracts cover repair, notification, classroom booking, lost-and-found, hygiene, dorm safety, visitor admission and energy maintenance. Each has Zod input/output, owner, permission, risk, approval, timeout, retry, rate limit, audit, compensation and Eval metadata. |
| 2 | Skill control plane and bindings | Complete | Definitions, immutable versions, tenant/role bindings, Eval results, real-operation previews and rate counters are represented in SQL and Drizzle. Published versions reject update/delete. |
| 3 | Fixed governed execution lifecycle | Complete | Application and Service Role RPC boundaries enforce Prepare -> Preview -> Approve -> Revalidate -> Commit -> Verify -> Report. Approval never causes a write before revalidation. |
| 4 | Tenant, permission and resource scope enforcement | Complete | The current task-owner identity and active role assignments are reloaded at execution. Server-read organization/building/class/self scope is checked by both the Gateway and database binding guard. |
| 5 | Atomic and idempotent business effects | Complete | Version/state checks, domain mutation, tool invocation, business-effect ledger, audit and transactional Outbox are committed together; retries replay one effect instead of writing twice. |
| 6 | Eight real explicit domain adapters | Complete | Repair dispatch, audience-resolved notification delivery tasks, conflict-safe classroom booking, privacy-safe claim, deterministic hygiene rectification, onsite safety confirmation, one-time short-lived visitor QR and real-reading maintenance recommendation each have explicit prepare/commit/verify branches. |
| 7 | High-risk safety invariants | Complete | More than 10 dispatches or 500 notification recipients require two approvers; AI scores are advisory, dorm safety cannot issue punitive conclusions, visitor tokens are hash-only in persistence/audit, and maintenance forbids synthetic/random readings. |
| 8 | Durable Agent orchestration integration | Complete | Agent nodes persist the real business preview, request approval against it, revalidate after approval, commit through the Gateway, and reach COMPLETED only with a VERIFIED effect. |
| 9 | Unsafe legacy execution removed | Complete | The old direct database Skill executor and old team engine now fail closed; no active caller remains. The dorm inspection mock fallback was removed and replaced with authenticated tenant-filtered access. |
| 10 | Focused regression gate | Complete | Runtime, repository, recovery, API, contracts, migrations, Gateway, eight-adapter, identity, TypeScript and targeted ESLint checks all pass. |

AI-3 includes the additive `0003_skill_gateway_domains.sql` migration, the `0004_ai_skill_postgres_fixes.sql` forward fix and the PostgreSQL port. All eight additive migrations through enterprise operations `0006`, the DeepSeek audit ledger `0007` and the trusted knowledge platform `0008` were applied to the isolated local cluster; no external deployment was performed.

AI-3 product acceptance is **complete** for the local enterprise preview. The new product pages use the durable task/Gateway contract, show real preview/approval/lifecycle/effect/audit evidence, use the immutable Skill registry, call the correct task APIs, run all eight adapters against local PostgreSQL, and connect all eight business pages to tenant-filtered domain state.


## Previously completed acceptance

### Stage A (6/6)

1. Reconciled the original 13 business roles and added the dedicated AI operations administrator as the fourteenth canonical role.
2. Canonicalized the role enum and hierarchy.
3. Built a one-to-one 14-account demo identity catalog.
4. Delivered the professional role selector on the login page.
5. Passed 14/14 API login and signed-session checks.
6. Passed the role-login browser checks and the dedicated AI operations page-access check.

### Stage B-1 (8/8)

1. School, campus, organization, class and building model.
2. External identity, scoped role and delegation model.
3. Revocable server session model.
4. Unified identity repository.
5. RBAC + scoped ABAC + fail-closed RLS for the identity domain.
6. Identity administration API.
7. Role-assignment and scope administration.
8. Admin identity UI.

## Focused verification evidence

- `pnpm run test:ai-runtime`: passed; 14/14 role teams, 20 governed catalog entries and 62 assertions.
- `pnpm run test:ai-api`: passed against PostgreSQL; catalog, authentication, idempotency, recovery authorization, governed task flow and eight domain read models with 44 assertions.
- `pnpm run test:ai-migration`: passed; 12 tables, 7 RPCs, fail-closed RLS, optimistic versioning and transactional outbox contract.
- `pnpm run test:ai-repository`: passed; idempotency, tenant filtering, optimistic conflicts and outbox with 13 assertions.
- `pnpm run test:ai-recovery`: passed; leases, heartbeat, requeue, duplicate-claim prevention, retry eligibility and dead-letter with 18 assertions.
- `pnpm run test:ai-skills`: passed; eight immutable contracts and 11 governed compatibility aliases.
- `pnpm run test:ai-skill-migration`: passed; six control tables, nine new canonical domain tables and eight explicit prepare/commit/verify adapters.
- `pnpm run test:ai-skill-gateway`: passed; approval, revalidation, stale blocking, dual approval, verification and idempotent replay.
- `pnpm run test:ai-business-adapters-postgres`: passed against real PostgreSQL; 8 planned, 8 approved, 8 committed, 8 verified and 8 domain read-backs.
- Targeted TypeScript check: passed.
- Targeted ESLint error gate for changed AI files: passed.
- Hard-coded DeepSeek credential scan: 0 matches.
- `pnpm run test:identity-api`: passed against PostgreSQL; 14/14 identities and 72 API assertions, including the AI operations administrator.
- `pnpm run test:identity`: passed; tenant, organization, class, delegation and suspension invariants.
- `pnpm run test:identity-migration`: passed previously; 11 tables, 5 functions, 13 roles and fail-closed RLS contract.
- AI browser smoke: passed; 12/12 AI pages returned HTTP 200, rendered their product landmarks and exposed zero code-style views.
- AI operations browser smoke: passed; the `ai_ops_admin` account accessed 2/2 dedicated operations pages.
- Local PostgreSQL persistence check: passed; system readiness reports `postgres`, governance is persistent, and raw visitor QR tokens are not persisted.
- Preview remains available at `http://localhost:3100/login`.

- `pnpm run test:baize-api`: passed; 21 assertions covering anonymous denial, PostgreSQL Q&A, persisted command/handoff dialogue, White Ze coordinator identity, natural-language repair+notification fan-out, two real previews, 2/2 verified effects, business-language aggregation, persistent governance, student denial and clarification.
- Baize fan-out runtime acceptance: two independent business adapters committed concurrently and both returned `VERIFIED`.
- Baize full-screen visual capture: `artifacts/baize-runtime-preview.png` inspected at 1920x1080 during a real persisted execution-replay frame.
- `pnpm run test:ai-operations`: passed; role, tenant-wide observation, settings, diagnostics, recovery and feedback governance with 19 assertions.

## Remaining deep AI gates after the page-first transformation

The requested five-stage page-first transformation is complete locally. The overall V2 AI roadmap is intentionally **not** marked 7/7 complete because the following deep capabilities still require real backend implementation and acceptance:

1. **AI-4 remaining gate:** provider-agnostic multi-vendor routing, complete rate-card cost governance, quality datasets and repeatable Eval suites. Real DeepSeek invocation and token/latency/hash trace are complete.
2. **AI-5 remaining scale gate:** OCR/layout/table parsing, neural embeddings with pgvector ANN, Neo4j community summaries and corpus-scale RAG quality Evals. Versioned ingestion, local hybrid retrieval, citations and governed GraphRAG are complete.
3. **AI-6 deep gate:** evaluation-driven automated improvement, causal analysis, guarded RL sandbox and digital-twin MVP.
4. **AI-7 deep gate:** real multimodal inference, cross-school trust/federation and production-scale resilience.

Current pages expose only capabilities that are actually available, persist settings/feedback where implemented, and fail closed for unconfigured external services. No deployment was performed. The local preview remains available at `http://localhost:3100/login`, with the White Ze mission control at `http://localhost:3100/ai-agents/runtime`.
