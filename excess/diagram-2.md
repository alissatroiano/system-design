[ User Browser / Client ]
           │  ▲
           ▼  │  HTTPS / WSS
┌────────────────────────────────────────────────────────┐
│ NEXT.JS BFF TIER                                       │
│ • Next.js App Router (SSR/ISR)  • Route Handlers (BFF) │
└──────────────────────────┬─────────────────────────────┘
                           │  ▲
                           ▼  │  gRPC / Internal REST
┌────────────────────────────────────────────────────────┐
│ NODE.JS / TYPESCRIPT CORE BACKEND SERVICES             │
│ • API Gateway    • Core Services    • Zod Validation   │
└────────────┬─────────────┬─────────────┬───────────────┘
             │             │             │
   Reads/    │             │             │ Publish/
   Writes    ▼             ▼             ▼ Subscribe
┌────────────┴────────┐ ┌──┴──────────┐ ┌────────────────┐
│ HYBRID STORAGE TIER │ │ FILE STORE  │ │ EVENT BROKER   │
│ • PostgreSQL        │ │ • AWS S3    │ │ • BullMQ       │
│   (Relational +     │ └─────────────┘ │   (via Redis)  │
│    JSONB Document)  │                 │ • Apache Kafka │
│ • Redis Cache       │                 └────────────────┘