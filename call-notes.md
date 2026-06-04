
# Notes

<mark>Asynchronous programming</mark>
: is a technique where a program initiates a long-running task and immediately moves on to other tasks rather than waiting for the first one to finish. Once the background task completes, the program is notified and processes the result.

<mark>JSONB Columns:</mark>
: Used for flexible, nested, or rapidly evolving schema-less data (e.g., preferences, product\_attributes, api\_metadata).

## PostgreSQL for JSONB

Using [PostgreSQL](https://www.postgresql.org/) for **JSONB** creates a powerful **Hybrid Document-Relational model**. It bridges the gap between traditional **ACID** guarantees and the schemaless flexibility usually associated with NoSQL databases.

### How the Hybrid Structure Works**

*   **Relational Columns:** Used for stable business data, primary/foreign keys, and highly queried filtering criteria (e.g., user\_id, created\_at, status).
    
*   **JSONB Columns:** Used for flexible, nested, or rapidly evolving schema-less data (e.g., preferences, product\_attributes, api\_metadata).    

**2\. ACID Guarantees with JSONB**PostgreSQL enforces strict ACID compliance natively, even when rows contain JSONB:

*   **Atomicity:** You can update both standard relational columns and deeply nested JSONB paths in a single, atomic transaction. If part of the update fails, the entire transaction rolls back.
    
*   **Consistency:** You can apply strict CHECK constraints to a JSONB column so the database rejects invalid documents at the schema level.
    
*   **Isolation:** Handles concurrent reads and writes safely using Multi-Version Concurrency Control (MVCC).
    
*   **Durability:** Changes are committed to the Write-Ahead Log (WAL), protecting data against system failures. \[[1](https://www.youtube.com/watch?v=s63DEmCi0c0), [2](https://www.tigerdata.com/learn/understanding-acid-compliance), [3](https://sf.aitinkerers.org/technologies/postgres-database-for-storage), [4](https://trailheadtechnology.com/ef-core-10-turns-postgresql-into-a-hybrid-relational-document-db/), [5](https://www.red-gate.com/simple-talk/databases/mysql-vs-postgresql-json-data-type/)\]
    

**3\. Performance & Indexing Strategies**Because JSONB is stored in a decomposed, binary format—rather than plain text—it is fully indexable. \[[1](https://www.dbvis.com/thetable/everything-you-need-to-know-about-the-postgres-jsonb-data-type/), [2](https://levelup.gitconnected.com/dynamic-jsonb-queries-in-postgresql-via-rest-a-deep-dive-with-net-73fb4decfea1), [3](https://reintech.io/blog/spring-data-jpa-jsonb-postgres-advanced-types), [4](https://nandovieira.com/using-postgresql-and-jsonb-with-ruby-on-rails)\]

*   **GIN (Generalized Inverted Index):** Ideal for querying. A GIN index iterates through every key-value and scalar pair in a JSONB document, making path lookups extremely fast.
    
    *   _Example:_ CREATE INDEX idx\_data ON my\_table USING gin (my\_jsonb\_col); \[[1](https://www.architecture-weekly.com/p/postgresql-jsonb-powerful-storage), [2](https://www.youtube.com/watch?v=s63DEmCi0c0), [3](https://oneuptime.com/blog/post/2026-01-21-postgresql-jsonb/view), [4](https://blog.devgenius.io/leveraging-postgresqls-jsonb-for-flexible-data-models-56f6fc7f15e5), [5](https://www.citusdata.com/blog/2018/08/29/datatypes-you-should-consider-using/)\]
        
*   **B-tree / Generated Columns:** If you frequently sort or aggregate a single key inside a JSONB document, extract it using a generated column and apply a standard B-tree index to avoid the performance tax of scanning the whole JSON object. \[[1](https://www.snowflake.com/en/blog/engineering/postgres-jsonb-columns-and-toast/), [2](https://scalegrid.io/blog/using-jsonb-in-postgresql-how-to-effectively-store-index-json-data-in-postgresql/)\]
    

**4\. Trade-offs to Consider**

*   **Write Performance:** Writing or appending to JSONB takes slightly longer than standard relational columns or plain JSON because Postgres must convert and optimize the data into the binary format upfront. \[[1](https://www.tigerdata.com/learn/how-to-query-jsonb-in-postgresql), [2](https://www.cloudbees.com/blog/unleash-the-power-of-storing-json-in-postgres)\]
    
*   **Write Amplification:** Updating a single, tiny key in a massive JSONB document forces PostgreSQL to rewrite the entire JSONB object. \[[1](https://www.sitepoint.com/postgresql-jsonb-query-performance-indexing/)\]
    
*   **Storage Bloat:** Large JSONB columns may spill over into **TOAST** (The Oversized Attribute Storage Technique), which can hurt query performance if not managed by extracting frequently used keys. \[[1](https://www.snowflake.com/en/blog/engineering/postgres-jsonb-columns-and-toast/)\]

## NextJS as BFF Trade Off Example

### NextJS
- Dedicated, secure intermediary between your user interface and downstream microservices or third-party APIs. 
- Instead of exposing sensitive credentials or forcing the browser to fetch data from multiple databases, Next.js handles this logic securely on the server and delivers a single, tailored data payload directly to your frontend components

### Trade Offs that come with NextJS:
- Increased Latency & Network Hops: By routing client requests through Next.js proxy middleware to internal microservices, you add an extra network hop, increasing Time to First Byte (TTFB).
- Middleware Limitations: Next.js Edge Middleware executes before the route handler, meaning it can check for a cookie's presence but not necessarily its server-side validity or expiration.
- Duplicate Error/State Handling: You now have to manage session synchronization, caching strategies, and error handling across both your Next.js layer and your core backend services.
- Hosting Constraints: Deploying a full-scale Node.js server (required for complex, stateful BFFs) restricts you from simple static hosting. It often pushes you toward serverless or edge deployments optimized for platforms like Vercel.

