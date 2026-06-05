# System Architecture Plan

---

## Table of Contents
1. [Planning & Research](#planning--research)
2. [Architecture Overview](#architecture-overview)
   - [Backend](#backend)
   - [Data Handling — Hybrid Database (PostgreSQL + Redis)](#data-handling--hybrid-database-postgresql--redis)
   - [Frontend — Next.js BFF](#frontend--nextjs-bff)
3. [System Design Diagram](#system-design-diagram)
4. [Event-Driven Architecture (EDA)](#event-driven-architecture-eda)
5. [Full Tech Stack Reference](#full-tech-stack-reference)

---

## Planning & Research

### Defining the Problem

Every data-intensive system starts with one plain-English sentence:

> **A specific group of people cannot do a specific thing efficiently because of a specific constraint. This system removes that constraint.**

From this anchor, work outward before touching code:

- **Who are the users?** What do they already use? What do they expect in terms of speed and reliability?
- **What does the data look like?** How does it arrive — form submissions, file uploads, external API webhooks, scheduled jobs? How much of it? How fast?
- **What are the read patterns?** Is data read frequently by many people, or rarely by a few? Are reads simple lookups or complex aggregations?
- **What are the write patterns?** Are writes frequent and small (user events) or infrequent and large (batch jobs)?
- **What fails badly?** If the system is slow, what is the user impact? If it goes down, what breaks?

### User Research & Trade-Offs

Before architecture is designed, the most important trade-offs must be made explicitly:

| Trade-off | Question to answer first |
|---|---|
| Consistency vs. Speed | Do all users need to see the exact same data at the exact same moment? Or is slightly stale data acceptable in exchange for faster reads? |
| Relational vs. Document | Is the data highly structured with enforced relationships? Or does its shape vary and evolve rapidly? |
| Synchronous vs. Async | Does the user need to wait for an operation to complete, or can it happen in the background while they continue? |
| Durable vs. Ephemeral | Does this data need to survive a server restart, or is it session-scoped and acceptable to lose? |
| Monolith vs. Services | Is the team small enough to benefit from a single deployable unit, or large enough that independent scaling matters? |

---

## Architecture Overview

The system is organized into four layers. Each layer has a single, well-defined responsibility and communicates with adjacent layers through defined contracts.

```
[CLIENT]  →  [BFF / API GATEWAY]  →  [SERVICE LAYER]  →  [DATA LAYER]
                                                               ↓
                                              [PostgreSQL] [Redis] [S3]
```

---

### Backend

#### Entry Point & Gateway

All inbound traffic passes through a single entry point before reaching any business logic.

**Responsibilities:**
- **Authentication** — verify the caller's identity using JWT tokens or session cookies. Reject unauthenticated requests before they go any further.
- **Authorization** — check that the authenticated caller has permission to perform the requested operation on the requested resource.
- **Rate limiting** — prevent any single caller from overwhelming the system. Track request counts per user/IP in Redis (fast, ephemeral — ideal for this purpose).
- **Request parsing and validation** — parse the incoming payload and validate its shape using **Zod** schemas. A request that fails validation is rejected with a clear, structured error response. It never reaches business logic.

**Zod validation example:**

```typescript
import { z } from 'zod';

const CreateOrderSchema = z.object({
  userId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive().max(100),
  })).min(1),
  shippingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  }),
});

type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
```

> **Why Zod?** Zod schemas serve as the single source of truth for both runtime validation and TypeScript types. When the schema changes, the types change automatically — no drift between validation rules and type definitions.

#### Service Layer (Business Logic)

The service layer applies the rules of the domain. It has no knowledge of HTTP, databases, or network protocols. It only understands the language of the business:

- Check if a user is allowed to place an order.
- Calculate the total cost of a cart including applicable discounts.
- Determine whether an item is in stock.
- Decide whether to approve or flag a transaction.

The service layer receives validated, typed inputs from the gateway and returns domain objects. It delegates all I/O to the data access layer.

#### Data Access Layer

The data access layer translates between the service layer's domain language (TypeScript objects, value types) and the storage layer's language (SQL rows, Redis keys, S3 paths). It is the only layer that is allowed to touch the database directly.

**Responsibilities:**
- Execute reads and writes against PostgreSQL, Redis, and S3.
- Handle database errors and translate them into domain-level errors the service layer can understand.
- Manage connection pooling (via **pg** or **Prisma**) to prevent connection exhaustion.
- Implement the caching strategy — check Redis before hitting PostgreSQL; write to Redis after a successful PostgreSQL read.

---

### Data Handling — Hybrid Database (PostgreSQL + Redis)

This system uses a hybrid storage strategy: **PostgreSQL** for durable, relational, queryable data — and **Redis** for fast, ephemeral, frequently-accessed data. Each serves a fundamentally different purpose. The key discipline is knowing which data belongs where.

#### PostgreSQL — The Source of Truth

PostgreSQL stores all data that must be durable, consistent, and queryable across relationships. It is the system of record — if Redis is lost entirely, nothing permanent is lost, because PostgreSQL holds the ground truth.

**Use PostgreSQL for:**
- User accounts, roles, and permissions
- Orders, transactions, invoices
- Structured records with relationships (user → orders → items → products)
- Audit logs and history
- Any data that must survive a server restart

**JSONB for semi-structured data:**

PostgreSQL's `JSONB` column type allows flexible, schema-less sub-documents within an otherwise relational table. This is the right choice when a record's shape varies between rows (e.g., different product types with different attributes, or event payloads with variable fields).

```sql
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  user_id     UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Query inside the JSONB payload
SELECT * FROM events
WHERE payload->>'orderId' = '88421'
AND type = 'ORDER_PLACED';

-- Index a frequently-queried JSONB field
CREATE INDEX idx_events_order_id ON events ((payload->>'orderId'));
```

> **When to use JSONB vs. relational columns:** Use relational columns when the field is queried, filtered, joined, or aggregated. Use JSONB when the field is stored and retrieved as a blob, rarely queried, or has a shape that varies between rows.

#### Redis — The Speed Layer

Redis sits in front of PostgreSQL for data that is read far more often than it is written, and where a few seconds of staleness is acceptable. It dramatically reduces database load and response latency.

**Use Redis for:**
- **Session data** — keep user session state in Redis with a TTL. Fast to read, easy to expire.
- **API response caching** — cache the result of expensive PostgreSQL queries for a defined TTL.
- **Rate limiting counters** — increment a counter per user/IP per time window. Redis atomic operations make this race-condition-safe.
- **Pub/Sub event bus** — publish events between services. Consumers subscribe to channels and react asynchronously.
- **Leaderboards and real-time rankings** — Redis sorted sets make rank queries O(log N).
- **Distributed locks** — prevent two workers from processing the same job simultaneously.

**Cache-aside pattern (the standard approach):**

```typescript
async function getProduct(productId: string): Promise<Product> {
  const cacheKey = `product:${productId}`;

  // 1. Check Redis first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as Product;
  }

  // 2. Cache miss — query PostgreSQL
  const product = await db.query(
    'SELECT * FROM products WHERE id = $1', [productId]
  );

  // 3. Write to Redis with a 5-minute TTL
  await redis.set(cacheKey, JSON.stringify(product), 'EX', 300);

  return product;
}
```

#### Hypothetical Failure Scenarios

**Scenario 1: Redis goes down**

Redis is not the source of truth — PostgreSQL is. If Redis becomes unavailable, the cache-aside pattern degrades gracefully: every cache check throws or returns null, and the application falls through to PostgreSQL for every request. This increases database load significantly, but **no data is lost**. When Redis recovers, the cache warms up naturally as requests come in.

*Safeguard:* Implement a circuit breaker around Redis calls. If Redis is consistently unavailable, skip the cache check entirely instead of retrying on every request and adding latency.

```typescript
let redisAvailable = true;

async function getWithCache(key: string, fallback: () => Promise<any>) {
  if (!redisAvailable) return fallback();
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    const data = await fallback();
    await redis.set(key, JSON.stringify(data), 'EX', 300);
    return data;
  } catch (err) {
    redisAvailable = false;
    setTimeout(() => { redisAvailable = true; }, 30_000); // retry in 30s
    return fallback();
  }
}
```

**Scenario 2: PostgreSQL primary fails**

PostgreSQL should run in a primary + replica configuration. Replicas receive a continuous stream of write-ahead log (WAL) entries from the primary. If the primary fails:

1. A replica is promoted to primary (automatic with tools like Patroni, or manual with AWS RDS Multi-AZ).
2. The application's connection pool reconnects to the new primary.
3. Any writes that were in-flight at the moment of failure and not yet replicated are at risk of being lost — this is the replication lag window.

*Safeguard:* Use synchronous replication for critical write paths (e.g., financial transactions). Accept asynchronous replication for less critical data to preserve write throughput.

**Scenario 3: An S3 upload fails mid-transfer**

File uploads to S3 should use **multipart upload** for large files. If the upload fails partway through, the parts already uploaded are staged in S3 but not assembled. They incur storage costs without being useful.

*Safeguard:* Set a lifecycle policy on the S3 bucket to automatically delete incomplete multipart uploads after 24 hours. On the application side, catch upload errors and either retry the failed parts or delete all staged parts and return an error to the user.

**Scenario 4: A write succeeds in PostgreSQL but the Redis cache is not invalidated**

After a successful write to PostgreSQL, the code that was supposed to delete the stale cache key crashed before it could run. The cache now contains an outdated record.

*Safeguard:* Use TTLs on all cache entries as a safety net — even if invalidation fails, the cache will expire within the TTL window. For critical data, prefer shorter TTLs. For truly critical consistency requirements, skip caching entirely.

#### AWS S3 — Object Storage

S3 stores binary files and large objects that are not suitable for a relational database: user-uploaded files, exported reports, generated documents, images, and backups.

**Upload flow:**
1. The client requests a **pre-signed upload URL** from the backend.
2. The backend generates the URL using the AWS SDK and returns it to the client.
3. The client uploads the file directly to S3 — the file bytes never touch the application server.
4. S3 notifies the backend via an event (S3 event notification → message queue → consumer service) that the upload is complete.
5. The consumer service records the S3 object key in PostgreSQL, linking the file to the relevant record.

This pattern keeps large binary transfers out of the application layer and scales naturally with S3's throughput.

---

### Frontend — Next.js BFF

Next.js serves as the **Backend for Frontend (BFF)** — a thin server-side layer that sits between the browser and the backend services. Its purpose is not to contain business logic, but to:

- **Aggregate data** from multiple backend services into a single, page-shaped response.
- **Transform data** into the exact shape the UI needs — not the shape the backend stores it in.
- **Enforce access control** at the rendering layer — server components can check session cookies before deciding what to render.
- **Handle authentication flows** — OAuth callbacks, token refreshes, and session management happen in the BFF, not the browser.

#### Server Components vs. Client Components

Next.js 13+ introduced a clear separation between rendering contexts:

| Server Components | Client Components |
|---|---|
| Run on the server at request time (or build time for static). | Run in the browser after hydration. |
| Can access databases, environment variables, secrets directly. | Cannot access server-only resources. |
| Cannot use `useState`, `useEffect`, browser APIs. | Can use all React hooks and browser APIs. |
| Best for: data fetching, auth checks, layout. | Best for: interactivity, real-time updates, forms. |

#### Data Rendering Libraries

For mapping and rendering data-intensive interfaces in a Next.js + TypeScript environment:

**Tabular data:**
- **TanStack Table (React Table v8)** — headless table logic: sorting, filtering, pagination, grouping. No opinion on markup — you supply the JSX.
- **AG Grid Community** — full-featured data grid with virtual scrolling for large datasets.

**Charts and visualization:**
- **Recharts** — composable React chart components built on D3. Best for line, bar, area, and pie charts.
- **Tremor** — pre-built dashboard components (charts, KPI cards, stat blocks) designed for admin interfaces.
- **Victory** — React + React Native compatible charting.
- **Observable Plot** — powerful D3-based library for exploratory data visualization.

**Forms and validation:**
- **React Hook Form** — performant, uncontrolled form management. Integrates directly with Zod via the `@hookform/resolvers` package — the same Zod schemas used for backend validation can be reused on the frontend.
- **Radix UI** — unstyled, accessible form primitives (combobox, select, checkbox, dialog).

**Data fetching and synchronization:**
- **TanStack Query (React Query)** — manages server state: caching, background refetching, loading/error states, optimistic updates, and real-time synchronization via `refetchInterval` or WebSocket integration.
- **SWR** — lightweight alternative to React Query for simpler caching and revalidation needs.

**Real-time data:**
- **socket.io-client** — WebSocket client that pairs with socket.io on the Node.js backend.
- **EventSource (native browser API)** — for consuming Server-Sent Events streams from Next.js API routes.

---

## System Design Diagram

> **When to generate this diagram:** Produce it after the Architecture Overview is complete and all major data flows are agreed upon, but before any infrastructure is provisioned. Use it to validate alignment with all stakeholders. Update it whenever a significant architectural decision changes — a stale diagram is actively harmful.

See the visual diagram accompanying this document.

---

## Event-Driven Architecture (EDA)

This is the section where the call ended — covered in full depth here.

### What is an Event?

An event is a record that something happened. It is a fact — immutable, past tense. It does not tell other parts of the system what to do. It simply states: *this thing occurred, at this time, with this data.*

```
{
  "eventType": "ORDER_PLACED",
  "eventId": "evt_7a93bc",
  "timestamp": "2026-05-28T14:32:00.000Z",
  "payload": {
    "orderId": "88421",
    "userId": "usr_1047",
    "total": 149.99,
    "itemCount": 3
  }
}
```

The `ORDER_PLACED` event does not say "send a confirmation email" or "decrement inventory." Those are decisions made by the services that receive the event. The event itself is neutral — it is a fact about what happened.

This is the core discipline of EDA: **services communicate through facts, not instructions.** Instead of Service A directly calling Service B and telling it what to do, A emits a fact and any service that cares about that fact reacts independently.

### Why Event-Driven? The Problem It Solves

In a tightly-coupled system:

```
Order Service  →  directly calls  →  Email Service
Order Service  →  directly calls  →  Inventory Service
Order Service  →  directly calls  →  Analytics Service
```

If Email Service is slow, Order Service is slow. If Inventory Service is down, Order Service fails. Adding a new Analytics Service requires modifying Order Service's code.

In an event-driven system:

```
Order Service  →  emits "ORDER_PLACED"  →  Message Bus
                                              ↓
                          Email Service  (subscribes, reacts)
                          Inventory Service (subscribes, reacts)
                          Analytics Service (subscribes, reacts)
```

Order Service does not know any of these consumers exist. Adding a new consumer requires no changes to Order Service. A failure in Email Service does not affect order processing.

### EDA Core Vocabulary

| Term | Definition |
|---|---|
| **Event** | A record that something happened. Immutable. Past tense. Contains the data describing what occurred. |
| **Event Producer** | The service that detects something happened and emits the event. Does not know who will consume it. |
| **Event Consumer** | A service that subscribes to a type of event and reacts to it. May do nothing, one thing, or many things. |
| **Message Bus / Broker** | The infrastructure that receives events from producers and routes them to consumers. Redis Pub/Sub, BullMQ queues, or dedicated brokers (Kafka, RabbitMQ). Producers and consumers never talk directly. |
| **Topic / Channel** | A named stream of events. Producers emit to a topic. Consumers subscribe to a topic. Events of the same logical type live on the same topic. |
| **Queue** | A channel where each event is delivered to exactly one consumer. Used for jobs that should be done once by one worker. |
| **Pub/Sub** | Publish-Subscribe. One event delivered to multiple consumers simultaneously. Each consumer gets its own copy. |
| **Consumer Group** | A set of consumers that share the work of a topic. The bus distributes events across the group — each event goes to one member. Used for horizontal scaling of consumers. |
| **Offset / Cursor** | A marker tracking how far a consumer has read through an event stream. Allows consumers to replay events or resume after a restart. |
| **Dead Letter Queue (DLQ)** | A separate queue where events go when they cannot be processed after repeated attempts. The main pipeline continues; failures are isolated for investigation. |
| **Idempotency** | The property of an operation that produces the same result whether run once or ten times. Critical in EDA because events can be delivered more than once. |
| **At-least-once delivery** | The bus guarantees every event reaches every consumer at least once — but may deliver it multiple times. Consumers must be idempotent. |
| **Exactly-once delivery** | Every event is processed exactly once. Harder and more expensive than at-least-once. Not always necessary. |
| **Backpressure** | A mechanism that slows producers when consumers cannot keep up, preventing the system from being overwhelmed. |
| **Event Schema** | The defined structure of an event — its fields, types, and constraints. A shared contract between producers and consumers. Changing a schema without coordination breaks consumers. |
| **Event Sourcing** | An architectural pattern where the system's state is derived entirely from its event log rather than storing current state directly. |
| **CQRS** | Command Query Responsibility Segregation. Separates write paths (commands) from read paths (queries). Commonly paired with EDA for independent scaling of reads and writes. |
| **Saga** | A pattern for managing long-running, multi-step processes across services using events. Each step emits a success or failure event triggering the next step or a compensating action. |
| **Compensating Event** | An event emitted to undo a previous step when a saga fails. The distributed equivalent of a rollback. |
| **Webhook** | A lightweight event delivery mechanism where the producer sends an HTTP POST to a consumer's registered URL when an event occurs. |
| **WebSocket** | A persistent, bidirectional connection between client and server. Allows the server to push events to the browser in real time without the client polling. |
| **Server-Sent Events (SSE)** | A one-way persistent HTTP connection from server to client. The server streams events as they occur. Simpler than WebSockets when only the server needs to push. |
| **Long Polling** | The client sends a request; the server holds it open until an event occurs (or timeout), then responds. Less efficient than WebSockets but works with standard HTTP. |

### What is an Asynchronous Call?

A **synchronous call** blocks the caller until a response arrives:

```
Caller:  → sends request → waits → waits → waits → receives response → continues
```

An **asynchronous call** allows the caller to continue immediately while the operation runs in the background. The result is handled when it arrives — via a callback, a Promise, or an event:

```
Caller:  → sends request → continues doing other work
                                        ↓
                           [ response arrives ] → handle it
```

In a backend service, this matters enormously. If three operations are needed to build a response (a database query, an external API call, and a cache lookup), a synchronous approach runs them serially. An asynchronous approach runs all three concurrently — total time equals the slowest single operation, not the sum of all three.

```typescript
// Synchronous (serial) — total time = A + B + C
const user = await getUser(userId);
const orders = await getOrders(userId);
const preferences = await getPreferences(userId);

// Asynchronous (concurrent) — total time = max(A, B, C)
const [user, orders, preferences] = await Promise.all([
  getUser(userId),
  getOrders(userId),
  getPreferences(userId),
]);
```

### Async Patterns from Backend to Frontend

#### Pattern 1 — Request / Response (Async HTTP)

The standard pattern. The client sends an HTTP request; the backend processes and responds. The client does not freeze — it shows a loading state while awaiting the response.

On the frontend with TanStack Query:

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['orders', userId],
  queryFn: () => fetch(`/api/orders?userId=${userId}`).then(r => r.json()),
  staleTime: 60_000, // consider data fresh for 60 seconds
});
```

#### Pattern 2 — Message Queue (Background Jobs)

The client submits a request, the server acknowledges receipt immediately, and the actual work happens asynchronously in the background via a job queue.

This is the correct pattern for any operation that takes more than ~200ms: sending emails, processing uploads, generating reports, calling slow third-party APIs.

With **BullMQ** (Redis-backed queue):

```typescript
// Producer — add a job to the queue
import { Queue } from 'bullmq';
const emailQueue = new Queue('emails', { connection: redis });

await emailQueue.add('send-confirmation', {
  to: user.email,
  orderId: order.id,
  template: 'order-confirmation',
});

// Return 202 Accepted immediately — don't wait for the email
res.status(202).json({ message: 'Order placed. Confirmation email queued.' });

// Consumer — process the job in a separate worker process
import { Worker } from 'bullmq';
const worker = new Worker('emails', async (job) => {
  await sendEmail(job.data); // actually send the email
}, { connection: redis });
```

The user never waits for the email. If the email worker is slow or temporarily down, jobs accumulate in the queue and are processed when the worker recovers — without any user-facing impact.

#### Pattern 3 — WebSocket (Real-Time Bidirectional)

A persistent connection between the client and server. Either side can send messages at any time. The server pushes events to the client the moment they occur.

**Server setup (socket.io + Node.js):**

```typescript
import { Server } from 'socket.io';
const io = new Server(httpServer);

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;

  // Subscribe this socket to events for this user
  socket.join(`user:${userId}`);

  // When an order status changes, push the event to the user's room
  orderEventEmitter.on('ORDER_STATUS_CHANGED', (event) => {
    if (event.userId === userId) {
      socket.emit('order:status', event);
    }
  });
});
```

**Client setup (React + socket.io-client):**

```typescript
const socket = io('/');

socket.on('order:status', (event) => {
  // Update the UI in real time — no polling, no refresh
  queryClient.setQueryData(['order', event.orderId], (old) => ({
    ...old,
    status: event.newStatus,
  }));
});
```

#### Pattern 4 — Server-Sent Events (Real-Time Server Push)

A one-way persistent HTTP connection. The server streams events to the client. Simpler than WebSockets; best for dashboards, live feeds, and notifications where the client only needs to receive, not send.

**Next.js API route (SSE endpoint):**

```typescript
export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Subscribe to Redis Pub/Sub
      redisSubscriber.subscribe('order-updates', (message) => {
        send('order:update', JSON.parse(message));
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Client (browser native EventSource):**

```typescript
const source = new EventSource('/api/stream/orders');

source.addEventListener('order:update', (e) => {
  const event = JSON.parse(e.data);
  // Update UI
});
```

### Real EDA Event Examples (This System)

#### Example 1 — `ORDER_PLACED`

```
Producer:    Order Service
Consumers:   Email Service, Inventory Service, Analytics Service, Notification Service
Channel:     orders:placed
```

Flow:
1. User submits order → Order Service validates and writes to PostgreSQL.
2. Order Service emits `ORDER_PLACED` to the message bus.
3. **Email Service** consumes it → queues a confirmation email job in BullMQ.
4. **Inventory Service** consumes it → decrements stock counts in PostgreSQL.
5. **Analytics Service** consumes it → writes an event record to the analytics table.
6. **Notification Service** consumes it → pushes a real-time update via WebSocket to any connected client listening on `user:{userId}`.

Order Service finishes in milliseconds. All downstream work happens asynchronously.

#### Example 2 — `FILE_UPLOAD_COMPLETE`

```
Producer:    S3 Event Notification → Queue Consumer
Consumers:   Media Processing Service, Record Linking Service
Channel:     files:uploaded
```

Flow:
1. Client uploads file directly to S3 using a pre-signed URL.
2. S3 fires an event notification to an SQS queue.
3. A queue consumer reads the SQS message and emits `FILE_UPLOAD_COMPLETE` internally.
4. **Media Processing Service** generates thumbnails, extracts metadata.
5. **Record Linking Service** writes the S3 object key to the relevant PostgreSQL record.

#### Example 3 — `USER_SESSION_EXPIRED`

```
Producer:    Auth Middleware (Redis TTL expiry listener)
Consumers:   Audit Log Service, Active Session Counter Service
Channel:     auth:session-expired
```

Flow:
1. Redis key `session:{sessionId}` expires (TTL reached or explicit deletion).
2. Auth middleware publishes `USER_SESSION_EXPIRED` via Redis Pub/Sub.
3. **Audit Log Service** records the session end in PostgreSQL.
4. **Active Session Counter Service** decrements the user's active session count.

### EDA Failure Handling

Asynchronous systems fail differently than synchronous ones. A synchronous failure is immediate and visible. An async failure may be silent.

**Design principles:**
- **Acknowledge receipt separately from successful processing.** The message bus should not mark an event as "done" until the consumer confirms it was processed correctly. If the consumer crashes mid-processing, the event is re-delivered.
- **Make all consumers idempotent.** An event may be delivered more than once. Processing `ORDER_PLACED` twice should not send two emails or charge the user twice. Use the `eventId` as a deduplication key.
- **Dead Letter Queues on every consumer.** Events that fail after N retries go to a DLQ. Alert when DLQ depth rises — a growing DLQ indicates a broken consumer.
- **Log every processing attempt.** Record the `eventId`, consumer name, timestamp, and outcome. This log is the only reliable audit trail in a distributed system.
- **Handle out-of-order delivery.** In distributed systems, two events emitted in sequence may arrive out of order. Use event timestamps to enforce ordering where it matters, or design consumers to be order-independent.

**BullMQ retry configuration:**

```typescript
await queue.add('process-order', payload, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s, 16s, 32s
  },
  removeOnFail: false, // keep failed jobs for inspection
});
```

### How EDA Connects the Backend to the Frontend

The full real-time data flow in this system:

1. **Something happens** — user places an order, a job completes, a status changes.
2. **Service emits an event** — `ORDER_PLACED` to the Redis Pub/Sub channel `orders:placed`.
3. **Consumer services react** — Email queued, inventory decremented, analytics recorded.
4. **Notification Service subscribes** to `orders:placed` and pushes a WebSocket event to any client in the `user:{userId}` room.
5. **Browser receives the WebSocket event** — TanStack Query's cache is updated via `queryClient.setQueryData`.
6. **React re-renders** — the UI updates in real time without a page refresh, without polling, without any user action.

The user sees their order status change from "Processing" to "Confirmed" the instant the backend confirms it. From the architecture's perspective, each step is completely decoupled — the Order Service does not know a notification will be sent; the Notification Service does not know what the frontend will do with the event.

---

## Full Tech Stack Reference

| Category | Technology | Purpose |
|---|---|---|
| **Language** | TypeScript | End-to-end type safety across backend and frontend |
| **Runtime** | Node.js | Server-side JavaScript runtime |
| **Framework (BFF)** | Next.js 14+ | Server components, API routes, BFF layer |
| **Validation** | Zod | Runtime schema validation + TypeScript type inference |
| **Primary DB** | PostgreSQL | Durable, relational, queryable data — source of truth |
| **Semi-structured** | PostgreSQL JSONB | Flexible schema within relational rows |
| **Cache / Queue / Pub-Sub** | Redis | Speed layer, session store, rate limiter, message bus |
| **Job Queue** | BullMQ | Redis-backed job queues with retry, DLQ, scheduling |
| **Object Storage** | AWS S3 | Files, images, exports, backups |
| **ORM / Query Builder** | Prisma or Drizzle | Type-safe database queries with migration management |
| **DB Connection Pool** | pg (node-postgres) | Low-level PostgreSQL client with connection pooling |
| **Real-Time (server)** | socket.io | WebSocket server for bidirectional real-time events |
| **Real-Time (client)** | socket.io-client | Browser WebSocket client |
| **Server Push** | EventSource (native) | SSE consumer in the browser |
| **Data Fetching** | TanStack Query | Client-side server state, caching, background refetch |
| **Tables** | TanStack Table | Headless table logic — sort, filter, paginate |
| **Charts** | Recharts / Tremor | Composable data visualization in React |
| **Forms** | React Hook Form | Performant uncontrolled form management |
| **Form Validation** | @hookform/resolvers | Zod integration — reuse backend schemas on the frontend |
| **UI Primitives** | Radix UI | Accessible, unstyled components (dialog, select, tooltip) |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Auth** | NextAuth.js (Auth.js) | Session management, OAuth, JWT, credentials |
| **File Uploads** | AWS SDK v3 | Pre-signed URL generation, multipart upload |
| **Environment** | dotenv / t3-env | Type-safe environment variable validation at startup |
| **API Contracts** | tRPC | End-to-end type-safe RPC between Next.js server and client |
| **Testing** | Vitest + Supertest | Unit and integration tests |
| **CI/CD** | GitHub Actions | Automated test, lint, build, and deploy pipelines |
| **Containerization** | Docker | Consistent environments across dev and production |
| **Infrastructure** | AWS (ECS / EC2 / RDS) | Managed PostgreSQL (RDS), container hosting, S3 |

---

*This document should be treated as a living reference. Update it whenever a significant architectural decision changes. A stale architecture document is worse than no document — it creates false confidence about how the system actually works.*