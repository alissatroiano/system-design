# System Architecture Plan

## Table of Contents
1. [Planning & Research](#planning--research)
    - [Planning](#planning)
2. [Architecture Overview](#architecture-overview)
    - [Backend](#backend)
    - [Data Handling (read, save, clean, store, render)](#data-handling-read-save-clean-store-render)
    - [Frontend](#frontend)
    - [Event-Driven Architecture (EDA) — thorough breakdown](#event-driven-architecture-eda--thorough-breakdown)
3. [System Design](#system-design)

## Planning & Research

### Planning
- User Research
- Trade-Offs

Walkthrough (problem → goals → data lifecycle) — generic guidance for planning a
data-intensive full-stack system. No languages or frameworks mentioned.

#### 1) Define the problem and success criteria
- Who are the users and what are their measurable goals (latency, freshness,
  throughput, availability, cost)? Define SLOs and SLAs up front.
- Identify data domains, ownership, and regulatory constraints (PII, retention,
  residency, access control). Clarify acceptable consistency models.

#### 2) Model the data and the domain
- Capture authoritative sources and events that change domain state.
- Draw bounded contexts and ownership for each data type and service.
- Decide read models (what the UI needs) separate from write models.

#### 3) Design the data lifecycle (ingest → process → store → serve → observe)
- Ingest: where data enters (user input, mobile/web clients, sensors, files,
  external APIs, partner systems). Choose between batch or streaming intake
  based on timeliness requirements.
- Validate & Clean: schema validation, typing, canonicalization, dedupe,
  enrichment, provenance tagging. Fail fast for invalid input; emit
  telemetry for analysis.
- Transform & Enrich: normalize formats, join with reference data, compute
  derived metrics, and create both operational and analytical shapes.
- Persist: separate operational state (for transactional access) from
  analytical/archival stores and event logs.
- Serve & Render: provide tailored read models for frontend needs via APIs,
  materialized views, caches, or streaming endpoints.
- Observe: capture metrics, traces, and logs to verify data correctness,
  latency, throughput, and errors.

#### 4) Iterate with small, vertical slices
- Implement a minimal happy path that proves ingestion → render.
- Add monitoring, then incrementally add resilience (retries, DLQs,
  backpressure) and scaling.

#### 5) Decouple using asynchronous events (Event-Driven Architecture)
- Use events to represent state changes and integration points between
  bounded contexts. Prefer well-defined event schemas and versioning.
- For cross-system flows that do not need synchronous confirmation,
  publish events and let interested consumers react at their own pace.

> Example phone-ready summary:
>
> Start by defining the user-facing goals and required freshness. Model the
> domain and identify authoritative data sources. Implement a small pipeline
> that ingests, validates, stores, and serves a minimal dataset. Then switch to
> an event-driven approach to emit domain events for other services to consume,
> adding retries, dead-letter handling, and monitoring as you scale.

## Architecture Overview

This overview is written for the start of a project, before a technical stack
is chosen. It focuses on architecture decisions, trade-offs, and how to evolve
the design safely for an enterprise, data-intensive system.

### Trade-off framing
- Latency vs Cost: lower latency often means more compute and more complex
  operational plumbing (streaming, caching). Batch processing reduces cost but
  increases freshness delay.
- Strong consistency vs Availability: distributed systems usually choose
  eventual consistency for availability and scale. Assess where strict
  transactional guarantees are required and isolate them.
- Simplicity vs Flexibility: a monolithic data model is simple early on but
  becomes brittle at scale. Use bounded contexts and clear contracts.

## Backend

The backend is responsible for ingestion, processing, durable storage, and
serving data to clients or downstream systems.

### Core responsibilities and trade-offs
- Ingest: choose push (clients send) or pull (polling external sources).
  - Trade-off: push is timely but requires robust authentication and quota
    controls; pull centralizes control but may increase latency.
- Processing: choose between batch windows or continuous streaming.
  - Trade-off: batch simplifies correctness and testing; streaming improves
    timeliness and supports fine-grained events.
- Storage: separate OLTP for transactional access vs OLAP for reporting.
  - Trade-off: duplicating data increases storage and complexity but improves
    query performance and isolation.

### Data Handling (read, save, clean, store, render)

- Read (ingest)
  - Identify all source types: user input, partner APIs, files, logs, streams,
    or sensors.
  - Validate incoming data against a schema; reject or quarantine invalid
    payloads with clear error events.
  - Accept a mixture of synchronous and asynchronous ingestion depending on
    client requirements (e.g., immediate acknowledgement vs eventual processing).

- Save (persistence)
  - Use append-only event logs for capture when auditability and history are
    important. Store canonical events as the source of truth where feasible.
  - For operational state, maintain a transactional store with well-defined
    update semantics. Persist derived data into separate materialized views.
  - Choose partitions, sharding, and compaction policies based on access
    patterns and retention needs.

- Clean (validation & transformation)
  - Apply schema validation, type normalization, and canonical value mapping.
  - Deduplicate using unique keys or idempotency tokens; mark tombstones for
    deletes when needed.
  - Enrich events with provenance metadata (source id, received timestamp,
    correlation id) for observability and lineage.

- Store (operational vs analytical)
  - Operational stores provide low-latency reads and transactional updates.
  - Analytical stores (data warehouse or OLAP structure) are optimized for
    complex queries and aggregations; populate them via batched or streaming
    ETL/ELT from event logs or change data capture.
  - Use cost-effective cold storage for long-term retention and hot stores
    for recent, frequently accessed data.

- Render (serving to frontend)
  - Create read models shaped for UI needs (denormalized if necessary).
  - Serve via APIs, precomputed materialized views, or direct streaming feeds
    to the frontend. Employ caches and pagination to manage large datasets.
  - Use optimistic UI updates where UX requires immediate feedback, and
    reconcile with eventual state when authoritative events arrive.

## Frontend

- The frontend should depend on stable, versioned read models or APIs.
- Prefer small, idempotent interactions from the UI to backend systems.
- Use optimistic updates carefully and show reconciliation states (syncing,
  conflict detected) to users when necessary.

## Event-Driven Architecture (EDA) — thorough breakdown

EDA is an architectural style where services communicate by emitting and
reacting to events that describe state changes. It decouples producers from
consumers and enables asynchronous, scalable, and extensible systems.

### Key EDA concepts and components
- Event: a fact that something happened (immutable, time-stamped, typed).
- Command: an intent to perform an action; may generate events if successful.
- Producer/Publisher: creates and emits events or commands.
- Consumer/Subscriber: listens for events and reacts (update state, call other
  services, emit new events).
- Broker/Message Bus: acts as an intermediary that stores, routes, and
  delivers messages (topics, queues, streams).
- Topic / Channel: logical stream of events of a particular category.
- Queue: point-to-point message delivery where one consumer processes a
  message.
- Partition: a slice of a topic that allows parallel consumption and ordering
  guarantees within the partition.
- Offset / Cursor: position marker for a consumer within a partition or stream.
- Consumer Group: a set of consumers cooperating to consume a topic in
  parallel while maintaining per-partition ordering.

### Delivery guarantees and semantics
- At-most-once: messages may be lost, but will not be duplicated.
- At-least-once: messages may be delivered multiple times; consumers must be
  idempotent to handle duplicates.
- Exactly-once (practical): very hard at scale; often approximated using
  idempotent operations, transactional writes, or specialized broker support.

### Important patterns and concepts
- Pub/Sub (publish-subscribe): many consumers can subscribe to a topic and
  react independently.
- Request-Reply: an interaction pattern where a caller sends a request and
  waits for a reply (can be implemented synchronously or via correlated
  messages).
- Event Sourcing: store the sequence of domain events as the primary source
  of truth and build state by replaying events.
- CQRS (Command Query Responsibility Segregation): separate read and write
  models; writes emit events that update read models asynchronously.
- Saga Pattern: coordinate long-running transactions across services using a
  sequence of local transactions and compensating actions (orchestrated or
  choreographed).
- Choreography vs Orchestration: choreography lets services react to events
  without a central controller; orchestration uses a central coordinator to
  execute steps.

### Event types and examples (non-exhaustive)
- Domain Events: UserCreated, OrderPlaced, PaymentCaptured, InventoryReserved
- CRUD Events: Create, Update, Delete, Upsert, Tombstone
- Integration Events: PartnerDataReceived, ExternalSyncCompleted
- Lifecycle Events: Started, Stopped, Paused, Resumed, Retried
- System / Operational Events: Heartbeat, HealthCheckFailed, ScaleUp,
  PartitionRebalance
- Error and Retry Events: ProcessingFailed, RetryScheduled, DeadLettered
- Compensation Events: OrderCancelledCompensation, RevertInventory
- Snapshot Events: SnapshotTaken, SnapshotExpired
- Audit Events: AccessGranted, PolicyChanged, PermissionRevoked
- Telemetry / Metrics Events: RequestLatencyReported, ThroughputSample
- Security Events: AuthenticationSucceeded, AuthorizationFailed,
  KeyRotationCompleted
- Schema / Evolution Events: SchemaVersionAdded, SchemaMigrationCompleted
- Data Pipeline Events: FileIngested, BatchProcessed, WindowClosed
- Time / Schedule Events: TimeoutOccurred, CronTriggered, RetryTimeout

### Event envelope — recommended fields
- Event ID (unique identifier)
- Event Type
- Timestamp
- Source / Producer ID
- Correlation ID (ties related events across services)
- Causation ID (what event caused this event)
- Schema Version
- Payload (the event data)
- Metadata (trace ids, provenance, lineage info)

### Asynchronous calls and how to use them
- Asynchronous call: an interaction pattern where a caller does not block
  waiting for a responder; the caller can continue work and handle the
  response when it arrives.
- Common async patterns:
  - Fire-and-forget: emit an event and do not expect an immediate response.
  - Request-reply (correlated): send a request message and receive a reply
    on a correlation channel; often includes timeouts and retries.
  - Streaming: consumers subscribe to a continuous stream of events.
  - Polling: the consumer periodically checks for new data (simpler but
    less timely and more load).

### Best practices for async usage
- Use correlation and causation IDs to trace flows across services.
- Make consumers idempotent to tolerate at-least-once delivery.
- Implement exponential backoff and jitter for retries to avoid thundering
  herds.
- Emit explicit error and retry events and route problematic messages to a
  Dead-Letter Queue (DLQ) for manual inspection and reprocessing.
- Ensure sensitive data is redacted or encrypted in event payloads and logs.

### Resilience and correctness
- Idempotency: derive unique idempotency keys for operations to avoid
  duplicate side effects when messages are replayed.
- Compensating actions: when a multi-step process fails, publish compensation
  events to undo prior effects.
- Backpressure: design producers and consumers to respect downstream capacity
  (rate limiting, batching, windowing).
- Ordering: document where ordering matters and enforce it by partitioning on
  a stable key; otherwise design for eventual ordering.

### Observability and testing
- Tracing: propagate correlation IDs and trace IDs through event metadata and
  surface end-to-end traces that follow an event across services.
- Metrics: collect counts, latencies, error rates, consumer lag, and retention
  metrics.
- Logging: emit structured logs with event ids and correlation ids.
- Contract testing: use consumer-driven contracts to ensure evolving event
  schemas remain compatible.

### Security, compliance, and governance
- Encrypt event data in transit and at rest; use per-tenant or per-domain
  encryption keys where required.
- Apply fine-grained access control to topics and storage.
- Retention policies: implement automatic expiry, compaction, and archival to
  meet regulatory requirements.
- Data minimization: avoid sending PII unless required; prefer pointers to
  protected storage with access controls.

### When to generate the system diagram
- Draft early: after domain modeling and before implementation to validate
  boundaries and data flows with stakeholders.
- Update iteratively: each major design change, release, or integration
  should produce a revised diagram.
- Freeze for delivery: include a final, reviewed diagram in the handoff and
  runbook.

## System Design 

The diagram below should be generated during the design phase after the
problem has been defined and the domain boundaries have been mapped. It is
useful again after major architectural decisions or service boundaries change.

```mermaid
flowchart LR
    Client[Client / User Interface]
    Ingest[Data Ingestion]
    Validate[Validation & Cleaning]
    EventBus[Event Bus / Message Broker]
    ServiceA[Service A
    (Domain Producer)]
    ServiceB[Service B
    (Domain Consumer)]
    Store[Persistent Stores]
    ReadModel[Read Model / Cache]
    Frontend[Frontend Rendering]

    Client -->|Submit data| Ingest
    Ingest --> Validate
    Validate -->|Create event| EventBus
    EventBus --> ServiceA
    EventBus --> ServiceB
    ServiceA -->|Update state| Store
    ServiceA -->|Publish update| EventBus
    ServiceB -->|Build projection| ReadModel
    Store --> ReadModel
    ReadModel --> Frontend
    Frontend -->|Render view| Client
```

Notes:
- Generate the diagram initially during architecture planning, before coding.
- Update it after domain boundaries and event flows are finalized.
- Revisit it after major integration or scaling decisions.

