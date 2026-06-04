
## System Architecture Plan

<!-- Use markdown to create a System Architectur Plan for an enterprise level, data-intensive system with a TypeScript + Node.js backend and Next.js for BFF. Must-Haves: A brief, but thorough, breakdown of the ***entire development cycle*** from backend server & data handling to frontend data rendering. This is a hybrid database, that will use PostgreSQL and Redis. Please explain how data can be handled in a hybrid database like this and include hypothetical scenarios (example: ways to prevent losing data if a server fails). The Tech Stack should include: ***TypeScript, JSONB, Zod, AWS S3, Redis, PostgreSQL, NextJS, GitHub, and any other necessary frameworks, libraries, and dependecies***. Please include a system design diagram and a thorough breakdown of how **Event-Driven Architecture (EDA)** will be used to decouple services and communicate asynchronously via events. Please include examples and explanations of these **events**. Please list libraries and frameworks that can be used for data mapping and rendering in this environment. 

- Please also include **trade-offs** for each service being used during each step of the Dev cycle, as well as safety guards that can be used to overcome potential hurdles.

 Refer to the NextJS Trade Off example below. Please proofread it, and add ways to overcome these hurdles.
- Please include a **system design diagram** using mermaid or a similar markdown diagram maker. Please include notes about exactly ***when in the development cycle*** this diagram should be generated.
-->

### System Design 

```mermaid
graph TD
    %% Define Design System and Color Themes
    classDef client fill:#eff6ff,stroke:#2563eb,stroke-width:2px;
    classDef bff fill:#f8fafc,stroke:#0f172a,stroke-width:3px;
    classDef service fill:#ecfdf5,stroke:#059669,stroke-width:2px;
    classDef cache fill:#fff1f2,stroke:#e11d48,stroke-width:2px;
    classDef database fill:#fef3c7,stroke:#d97706,stroke-width:2px;
    classDef queue fill:#faf5ff,stroke:#7c3aed,stroke-width:2px;
    classDef infra fill:#f1f5f9,stroke:#64748b,stroke-width:1px;

    %% DevOps / CI-CD Control plane
    subgraph DevOps_Plane [CI/CD & Control Engine]
        GH[GitHub Repositories] -->|GitHub Actions CI/CD| ECR[AWS Elastic Container Registry]
    end
    class GH,ECR infra;

    %% Edge and Routing Layer
    subgraph Edge_Layer [Global Edge Tier]
        Route53[AWS Route 53 DNS] --> Cloudfront[AWS CloudFront CDN]
        Cloudfront --> WAF[AWS WAF Firewall]
    end
    class Route53,Cloudfront,WAF infra;

    %% Client and BFF Tier
    subgraph Client_BFF_Tier [User Experience & BFF Layer]
        UI[Next.js Client / SPA]
        
        subgraph NextJS_BFF [Next.js BFF Node Server]
            BFF_Route[App Router Server Actions / API Routes]
            BFF_Zod[Zod Schema Validation]
            BFF_Cache[Fetch Cache / ISR]
            
            BFF_Route --> BFF_Zod
            BFF_Route --> BFF_Cache
        end
    end
    class UI client;
    class NextJS_BFF bff;

    %% Distributed Service Mesh Core
    subgraph Compute_Tier [TS + Node.js Core Services]
        direction LR
        Ingress[AWS ALBi / Ingress Controller]
        
        subgraph UserService [User Management Service]
            US_App[Node.js / Express or NestJS]
            US_Zod[Zod Input Validator]
            US_Prisma[Prisma / Drizzle ORM]
        end
        
        subgraph OrderService [Transaction Core Service]
            OS_App[Node.js Core App]
            OS_Zod[Zod Event Validator]
            OS_Prisma[Prisma / Drizzle ORM]
        end

        subgraph AnalyticService [Data Intensive Telemetry Service]
            AS_App[Node.js Engine]
            AS_Zod[Zod Stream Validator]
        end
    end
    class US_App,OS_App,AS_App service;

    %% Messaging Fabric (Decoupled EDA)
    subgraph Event_Fabric [Event-Driven Mesh Architecture]
        KafkaBroker[[Apache Kafka / AWS MSK Cluster]]
        SchemaRegistry[Confluent Schema Registry]
    end
    class KafkaBroker,SchemaRegistry queue;

    %% Persistence and Caching Ecosystem
    subgraph Storage_Tier [Enterprise Polyglot Data Tier]
        RedisCluster[(Redis Enterprise Distributed Cache)]
        
        subgraph PG_Cluster [PostgreSQL High Availability Cluster]
            PG_Primary[(Postgres Primary Write Node)]
            PG_Replica[(Postgres Read Replicas)]
            JSONB_Eng{{"JSONB Semi-Structured Engine\n(GIN Indexed)"}}
        end
        
        S3[(AWS S3 Standard Object Store)]
    end
    class RedisCluster cache;
    class PG_Primary,PG_Replica,S3 database;

    %% Explicit Data Flow Interconnections
    WAF --> Ingress
    Ingress --> NextJS_BFF
    
    %% BFF Communication down to Internal API
    NextJS_BFF -->|gRPC or Private HTTP/2| Ingress
    Ingress --> UserService
    Ingress --> OrderService

    %% Inter-service decoupling through Events
    OrderService -->|Publish Order.Created| KafkaBroker
    UserService -->|Publish User.Registered| KafkaBroker
    KafkaBroker -->|Subscribe & Process| AnalyticService
    
    %% Zod contract matching against registry
    OS_Zod <--> SchemaRegistry
    AS_Zod <--> SchemaRegistry

    %% Database Operations
    UserService --> RedisCluster
    RedisCluster -- Cache Miss --> PG_Replica
    UserService --> PG_Primary
    
    OrderService --> PG_Primary
    PG_Primary --> JSONB_Eng
    PG_Primary -->|Native Streaming| PG_Replica
    
    %% Large file extraction payload handling
    OrderService -->|Write Metadata| PG_Primary
    OrderService -->|Stream Heavy Blobs / PDFs / JSON Payload| S3
```

## NextJS as BFF Trade Off Example

### NextJS
- Dedicated, secure intermediary between your user interface and downstream microservices or third-party APIs. 
- Instead of exposing sensitive credentials or forcing the browser to fetch data from multiple databases, Next.js handles this logic securely on the server and delivers a single, tailored data payload directly to your frontend components

### Trade Offs that come with NextJS:
- Increased Latency & Network Hops: By routing client requests through Next.js proxy middleware to internal microservices, you add an extra network hop, increasing Time to First Byte (TTFB).
- Middleware Limitations: Next.js Edge Middleware executes before the route handler, meaning it can check for a cookie's presence but not necessarily its server-side validity or expiration.
- Duplicate Error/State Handling: You now have to manage session synchronization, caching strategies, and error handling across both your Next.js layer and your core backend services.
- Hosting Constraints: Deploying a full-scale Node.js server (required for complex, stateful BFFs) restricts you from simple static hosting. It often pushes you toward serverless or edge deployments optimized for platforms like Vercel.

