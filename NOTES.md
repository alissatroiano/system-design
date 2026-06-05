
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
