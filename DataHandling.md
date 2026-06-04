
# Data Handling

## Data Validation & Schema Parsing

- Zod: Best for general-purpose applications and form validation. It uses a highly readable, chainable API and provides automatic type inference.

## Database Access & ORMs

- Drizzle ORM: Best for maximum performance and SQL parity. It is an extremely lightweight, serverless-ready query builder that lets you write type-safe queries that mirror standard SQL.
- Prisma: Best for a developer-friendly API and automated migrations. It relies on a custom schema file to generate a fully type-safe client, making complex joins and relational queries incredibly easy.
- Supabase Client: Best for rapid backend development. It integrates seamlessly into TypeScript projects to provide real-time data sync, built-in authentication, and direct database queries via PostgREST.

### Data Analysis & Wrangling
- Simple Data Analysis (SDA): Best for working with tabular and geospatial data. It is a high-performance library available on NPM and JSR that simplifies standard data journalism workflows.
- Arquero: Best for wrangling array-backed datasets. It brings a robust, functional, grammar-of-data approach (similar to R's dplyr) to JavaScript and TypeScript applications.

### Advanced Data Structures & State
***When JavaScript's built-in Array, Map, and Set types are not efficient enough for complex algorithm performance.***
- data-structure-typed: Best for complex algorithms. It provides completely type-safe implementations of binary search trees, AVL trees, heaps, priority queues, and advanced graphs.
- Effect: Best for full-scale functional programming. It acts as a missing "standard library" for TypeScript, offering immutable data structures, sophisticated error tracking, and a powerful effect system.

** Zod cannot render UI components or map arrays on its own, but it is the industry standard for safely parsing and structuring the data before you hand it off to your frontend framework.

** Zod acts as a runtime gatekeeper. You use Zod to validate raw data (from an API or form), infer its TypeScript types, and then use standard frontend tools like React or Vue to map and render it.

### Frontend Architecture

* To use **Zod** for ***rendering***, you follow a three-step pipeline: 

```
Validate -> Transform/Map -> Render.
```

```ts
import { z } from 'zod';

// 1. DEFINE: Create the data schema
const UserSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).default('user'),
});

// Infer the TypeScript type automatically from the schema
type User = z.infer<typeof UserSchema>;

// 2. PARSE: Validate the incoming API payload safely
function fetchUsers(): User[] {
  const rawData = [
    { id: "1", firstName: "Alex", lastName: "Smith", email: "alex@example.com" },
    { id: "2", firstName: "Sam", lastName: "Jones", email: "invalid-email" } // Will be caught or stripped
  ];

  // .safeParse() prevents your frontend from crashing if the backend data is broken
  const result = z.array(UserSchema).safeParse(rawData);
  
  if (!result.success) {
    console.error("Data validation failed:", result.error.format());
    return []; // Return fallback safe data
  }
  
  return result.data; // Fully type-safe array
}
```
* Once Zod guarantees the shape of your data, you use native JavaScript .map() to render it into your UI.

```tsx
export function UserList() {
  const users = fetchUsers();

  return (
    <ul>
      {users.map((user) => (
        // You get full IDE autocomplete here because of Zod's type inference
        <li key={user.id}>
          {user.firstName} {user.lastName} ({user.email}) - <strong>{user.role}</strong>
        </li>
      ))}
    </ul>
  );
}
```
#### Data Mapping Inside Zod

***While Zod doesn't map UI elements, it can map data models during the validation phase using .transform(). This is highly useful for cleaning up messy backend data before rendering it.***

```ts
const ProductSchema = z.object({
  product_id: z.number(),
  cost_in_cents: z.number(),
}).transform((data) => ({
  // Map snake_case backend fields to camelCase frontend fields
  id: data.product_id,
  // Pre-calculate display values so your UI component stays clean
  formattedPrice: `$${(data.cost_in_cents / 100).toFixed(2)}`,
}));

// The frontend UI now receives: { id: number, formattedPrice: string }
```

#### Direct Integrations for Frontend Rendering

* Form Rendering: Use React Hook Form with the @hookform/resolvers package. Zod will automatically generate UI error messages for your form inputs.
* Form UI Generation: Use libraries like AutoForm. It reads a Zod schema and automatically renders the matching HTML inputs, labels, and validation errors without manual coding.


## NextJS as BFF Trade Off Example

### NextJS
- Dedicated, secure intermediary between your user interface and downstream microservices or third-party APIs. 
- Instead of exposing sensitive credentials or forcing the browser to fetch data from multiple databases, Next.js handles this logic securely on the server and delivers a single, tailored data payload directly to your frontend components

### Trade Offs that come with NextJS:
- Increased Latency & Network Hops: By routing client requests through Next.js proxy middleware to internal microservices, you add an extra network hop, increasing Time to First Byte (TTFB).
- Middleware Limitations: Next.js Edge Middleware executes before the route handler, meaning it can check for a cookie's presence but not necessarily its server-side validity or expiration.
- Duplicate Error/State Handling: You now have to manage session synchronization, caching strategies, and error handling across both your Next.js layer and your core backend services.
- Hosting Constraints: Deploying a full-scale Node.js server (required for complex, stateful BFFs) restricts you from simple static hosting. It often pushes you toward serverless or edge deployments optimized for platforms like Vercel.

