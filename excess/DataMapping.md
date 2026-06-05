# **Next.js + Zod Server Architecture**

This setup ensures that data validation and transformation happen entirely on the server, ensuring only clean, perfectly formatted data is sent across the network to your client-side chart.

```
[Database / API Source] 
         │ (Raw, untrusted JSON)
         ▼
[Next.js Server Component] ──> [Zod Schema (.safeParse + .transform)]
                                            │
                                            ▼ (Guaranteed Type & Format)
                               [Client Chart Component]
```

## Step-by-Step Implementation
1. Define the Schema and Transform (Server-Side)**Create a Zod schema that validates the types coming from your data source, and handles the mathematical and string mapping at the exact same time using .transform().ts

```ts
// app/dashboard/schemas.ts
import { z } from 'zod';

// This validates the raw backend layout
export const RawSalesItemSchema = z.object({
  date: z.string().datetime({ offset: true }), // Validates ISO timestamp string
  amount_cents: z.number().int().nonnegative(), // Guarantees positive integer cents
});

// Array validator that transforms the data format for your chart
export const ChartDataSchema = z.array(RawSalesItemSchema).transform((items) => 
  items.map((item) => ({
    // Convert '2026-01-15T00:00:00Z' into 'Jan'
    month: new Date(item.date).toLocaleDateString('en-US', { month: 'short' }),
    // Safely map cents to dollars
    revenue: item.amount_cents / 100, 
  }))
);
```

2. Parse the Data inside the Next.js Server Component**Fetch the data, pass it through the Zod schema, and elegantly handle any schema failures before your UI renders.tsx

```tsx
// app/dashboard/page.tsx
import SalesChart from '@/components/SalesChart';
import { ChartDataSchema } from './schemas';

async function fetchExternalSalesData() {
  const res = await fetch('https://yourbackend.com', {
    next: { revalidate: 3600 } // Cache data for 1 hour
  });
  
  if (!res.ok) throw new Error('Failed to fetch sales data');
  return res.json();
}

export default async function DashboardPage() {
  const rawData = await fetchExternalSalesData();

  // Validate and transform raw data simultaneously on the server
  const result = ChartDataSchema.safeParse(rawData);

  // If the API layout broke or returned bad types, intercept it here
  if (!result.success) {
    console.error('Zod Parsing Error:', result.error.format());
    
    return (
      <main className="p-8">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <p className="font-semibold">Unable to display analytics</p>
          <p className="text-sm">The data schema returned by the server is invalid.</p>
        </div>
      </main>
    );
  }

  // At this point, result.data is guaranteed to match ChartData type
  return (
    <main className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Financial Overview</h1>
      {/* Hand clean, lightweight data directly to your client component */}
      <SalesChart data={result.data} />
    </main>
  );
}
```

3. Accept the Type in the Client Component**Because your types are inferred directly from your Zod runtime schema, your chart component enjoys absolute safety and autocomplete.tsx

```tsx
// components/SalesChart.tsx
'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import type { ChartData } from '@/app/dashboard/schemas';

interface SalesChartProps {
  data: ChartData; // Fully type-safe using Zod's inference
}

export default function SalesChart({ data }: SalesChartProps) {
  return (
    <div className="w-full h-64 bg-white p-4 rounded-xl">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          {/* Autocomplete fully knows item.month and item.revenue */}
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="revenue" stroke="#2563eb" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

## **Key Advantages of this Setup**

- **Bulletproof Client Components**: Your charting component no longer contains logical code like dates parsing or math formulas. It only receives exactly what it needs to paint the screen.

- **Reduced Network Payload**: Transforming raw API items on the server strips out raw timestamps or nested meta fields, serving a drastically compressed JSON footprint to mobile devices.

- **Immediate Feedback Loops**: If your database schema alters in production, Next.js logs the structural failure through Zod instantly instead of serving empty, visually broken, or freezing charts to users.