const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat,
  HeadingLevel, ExternalHyperlink, TabStopType, PageBreak
} = require('docx');
const fs = require('fs');

// ── Design tokens ──────────────────────────────────────────────
const TEAL   = "1A7A7A";
const DARK   = "1A1A2E";
const MID    = "333333";
const LIGHT  = "555555";
const MUTED  = "777777";
const RULE   = "2E9E9E";
const ACCENT = "0D5C6B";
const HL_BG  = "E8F6F6";  // light teal highlight
const CODE_BG= "F4F4F4";

const hairline  = { style: BorderStyle.SINGLE, size: 6,  color: RULE,    space: 1 };
const noBorder  = { style: BorderStyle.NONE,   size: 0,  color: "FFFFFF" };
const thinBorder= { style: BorderStyle.SINGLE, size: 4,  color: "CCCCCC" };

// ── Helper builders ────────────────────────────────────────────
const gap = (pts=80) =>
  new Paragraph({ spacing: { before: 0, after: pts }, children: [] });

const rule = () =>
  new Paragraph({ border: { bottom: hairline }, spacing: { before: 0, after: 100 }, children: [] });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 80 },
    children: [new TextRun({ text, bold: true, size: 36, color: DARK, font: "Arial", allCaps: true })]
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 60 },
    border: { bottom: hairline },
    children: [new TextRun({ text, bold: true, size: 26, color: TEAL, font: "Arial" })]
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, bold: true, size: 22, color: ACCENT, font: "Arial" })]
  });

const h4 = (text) =>
  new Paragraph({
    spacing: { before: 160, after: 40 },
    children: [new TextRun({ text, bold: true, size: 20, color: DARK, font: "Arial", underline: {} })]
  });

const body = (text, opts={}) =>
  new Paragraph({
    spacing: { before: 40, after: 60 },
    children: [new TextRun({ text, size: 18, color: MID, font: "Arial", ...opts })]
  });

const bodyMix = (runs) =>
  new Paragraph({
    spacing: { before: 40, after: 60 },
    children: runs.map(([text, opts={}]) =>
      new TextRun({ text, size: 18, color: MID, font: "Arial", ...opts })
    )
  });

const bullet = (text, level=0) =>
  new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 30, after: 30 },
    children: [new TextRun({ text, size: 18, color: MID, font: "Arial" })]
  });

const bulletMix = (runs, level=0) =>
  new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 30, after: 30 },
    children: runs.map(([text, opts={}]) =>
      new TextRun({ text, size: 18, color: MID, font: "Arial", ...opts })
    )
  });

const numbered = (text, level=0) =>
  new Paragraph({
    numbering: { reference: "numbers", level },
    spacing: { before: 30, after: 30 },
    children: [new TextRun({ text, size: 18, color: MID, font: "Arial" })]
  });

const callout = (label, text) =>
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({ children: [
        new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 8, color: TEAL }, left: { style: BorderStyle.SINGLE, size: 24, color: TEAL }, bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL }, right: noBorder },
          shading: { fill: HL_BG, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 160, right: 120 },
          width: { size: 9360, type: WidthType.DXA },
          children: [
            new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: label, bold: true, size: 18, color: TEAL, font: "Arial", allCaps: true })] }),
            new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text, size: 17, color: MID, font: "Arial" })] }),
          ]
        })
      ]})
    ]
  });

const codeBox = (text) =>
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({ children: [
        new TableCell({
          borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
          shading: { fill: CODE_BG, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 160, right: 120 },
          width: { size: 9360, type: WidthType.DXA },
          children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text, size: 16, color: "1A1A2E", font: "Courier New" })] })]
        })
      ]})
    ]
  });

// Two-column table for comparisons / trade-offs
const tradeoffTable = (rows) => {
  const hBorder = { style: BorderStyle.SINGLE, size: 4, color: TEAL };
  const cBorder = { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" };
  const borders = { top: cBorder, bottom: cBorder, left: cBorder, right: cBorder };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: rows.map((row, i) =>
      new TableRow({
        children: row.map(cell =>
          new TableCell({
            borders,
            shading: { fill: i === 0 ? "D5F0F0" : "FFFFFF", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 4680, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: cell, size: 17, font: "Arial", color: i===0 ? TEAL : MID, bold: i===0 })] })]
          })
        )
      })
    )
  });
};

// ── Event term table ───────────────────────────────────────────
const eventTermTable = (rows) => {
  const b = { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" };
  const borders = { top: b, bottom: b, left: b, right: b };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2600, 6760],
    rows: rows.map((row, i) =>
      new TableRow({
        children: [
          new TableCell({
            borders,
            shading: { fill: i === 0 ? "D5F0F0" : (i%2===0 ? "F0FAFA" : "FFFFFF"), type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 2600, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: row[0], size: 17, font: "Arial", color: i===0 ? TEAL : ACCENT, bold: true })] })]
          }),
          new TableCell({
            borders,
            shading: { fill: i === 0 ? "D5F0F0" : (i%2===0 ? "F0FAFA" : "FFFFFF"), type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: 6760, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text: row[1], size: 17, font: "Arial", color: i===0 ? TEAL : MID, bold: i===0 })] })]
          }),
        ]
      })
    )
  });
};

// ── Document ───────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 300 } } } },
      ]},
      { reference: "numbers", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } },
      ]},
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 18 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 360, after: 80 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 280, after: 60 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    children: [

      // ══════════════════════════════════════════════════════════
      // TITLE PAGE
      // ══════════════════════════════════════════════════════════
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 720, after: 120 },
        children: [new TextRun({ text: "SYSTEM ARCHITECTURE PLAN", bold: true, size: 56, color: DARK, font: "Arial" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: "Data-Intensive Full Stack Application", size: 26, color: TEAL, font: "Arial" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: "Planning  ·  Architecture  ·  Event-Driven Design", size: 20, color: MUTED, font: "Arial", italics: true })]
      }),
      rule(),
      gap(40),

      // ══════════════════════════════════════════════════════════
      // SECTION 1 — PLANNING & RESEARCH
      // ══════════════════════════════════════════════════════════
      h1("1.  Planning & Research"),
      body("Before a single line of code is written, a well-designed system starts with a clearly defined problem and a deep understanding of what the people using the system actually need. Skipping this phase is the single most common cause of wasted engineering effort."),

      h2("1.1  Define the Problem"),
      body("Start with one plain sentence that describes the problem — not the solution. Anchor the entire project to a real pain point:"),
      gap(40),
      callout("Problem Statement", "A specific group of people struggle to do a specific thing because of a specific constraint. The goal of this system is to remove that constraint."),
      gap(60),
      body("From the problem statement, work outward:"),
      bullet("Who are the users? What do they already know? What do they already use?"),
      bullet("What does success look like to them — not to engineering?"),
      bullet("What is the minimum version of this system that solves the problem and nothing more?"),
      bullet("What happens if the system is slow? Down? Returns wrong data?"),

      h2("1.2  User Research & Goals"),
      body("User research does not have to be elaborate. Even a few conversations with real people who have the problem will prevent months of building the wrong thing. The goal is to separate what users say they want from what they actually do."),
      gap(40),
      tradeoffTable([
        ["What users say", "What to listen for instead"],
        ['"Make it faster"', "Ask: faster than what? Which specific step feels slow?"],
        ['"Add more features"', "Ask: what are you trying to accomplish that you currently can't?"],
        ['"Make it easier to use"', "Watch them use it — the friction is usually visible before they can name it."],
      ]),
      gap(80),

      h2("1.3  Trade-Off Decisions Before Building"),
      body("Every architectural choice is a trade-off. Making these decisions explicitly — before writing code — prevents expensive reversals later. The most important trade-offs at the planning stage are:"),
      gap(40),
      tradeoffTable([
        ["Trade-off", "The Question to Answer"],
        ["Consistency vs. Speed", "Does every user need to see the exact same data at the same moment, or is slightly stale data acceptable?"],
        ["Complexity vs. Flexibility", "Do we build something simple that solves today's problem, or something extensible that anticipates tomorrow's?"],
        ["Build vs. Buy", "Is this a core competency of the product, or a commodity that an existing service handles better?"],
        ["Monolith vs. Services", "Is the team and codebase small enough to benefit from simplicity, or large enough that independent deployability matters?"],
        ["Synchronous vs. Async", "Does the user need to wait for this operation to complete before they can continue, or can it happen in the background?"],
      ]),
      gap(80),

      // ══════════════════════════════════════════════════════════
      // SECTION 2 — ARCHITECTURE OVERVIEW
      // ══════════════════════════════════════════════════════════
      h1("2.  Architecture Overview"),
      body("This section describes the shape of a data-intensive system at the conceptual level, before any technology choices are made. The goal is to establish what each layer is responsible for and how data moves through the system — from the moment it enters to the moment it is rendered for a user."),
      gap(40),
      callout("When to produce this document", "Draft the Architecture Overview immediately after the Problem Statement and User Research are complete, and before any infrastructure or framework decisions are made. This document should be technology-agnostic — it describes what the system does, not how it does it. The technology choices follow from this plan, not the other way around."),
      gap(80),

      h2("2.1  Backend"),
      h3("Data Entry Points"),
      body("Every system has one or more entry points where data arrives from the outside world. These could be:"),
      bullet("A user submitting a form or clicking a button"),
      bullet("Another system sending data via an API call"),
      bullet("A scheduled job running at a set time"),
      bullet("A file being uploaded or a sensor emitting a reading"),
      gap(40),
      body("At each entry point, the system must answer three questions before doing anything else:"),
      numbered("Is this data from a source I trust and recognize?  (Authentication & Authorization)"),
      numbered("Is this data in the shape and range I expect?  (Validation)"),
      numbered("What should happen next?  (Routing to the correct handler)"),

      h3("Request Handling"),
      body("When a request arrives at the backend, it travels through a series of layers — each with a single, well-defined responsibility:"),
      gap(40),
      tradeoffTable([
        ["Layer", "Responsibility"],
        ["Entry / Gateway", "Receives the raw request. Authenticates the caller. Rejects anything malformed or unauthorized before it goes any further."],
        ["Validation", "Checks that the data itself is correct — required fields are present, types are right, values are in range. Returns a clear error if not."],
        ["Business Logic", "Applies the rules of the domain. This is the core of the application. It should have no knowledge of databases or network protocols — only the rules."],
        ["Data Access", "Reads from or writes to storage. Translates between the business logic's language (objects, values) and the storage layer's language (rows, documents, blobs)."],
        ["Response", "Packages the result and sends it back to the caller in a consistent, predictable format."],
      ]),
      gap(80),

      h2("2.2  Data Handling"),
      h3("The Data Lifecycle"),
      body("In a data-intensive system, data is rarely just stored and retrieved. It is continuously received, cleaned, transformed, enriched, stored, and eventually served. Understanding this lifecycle is the foundation of good data architecture."),
      gap(60),

      h4("Step 1 — Receive"),
      body("Data arrives in its raw form. It may come from a user, an external API, a file, a message queue, or a sensor. At this stage, the system knows nothing about whether the data is correct or useful — only that it has arrived."),
      bullet("Capture the source and timestamp of every piece of incoming data."),
      bullet("Do not process data synchronously at the entry point if processing is expensive. Accept it, acknowledge receipt, and hand it off."),
      bullet("Apply rate limiting at the entry point to prevent a single source from overwhelming the system."),

      h4("Step 2 — Validate"),
      body("Before any data is stored or acted upon, it must be validated. Validation is the boundary between the outside world and the internal system. Data that passes validation is data the system has agreed to be responsible for."),
      bullet("Check for required fields and correct data types."),
      bullet("Check for value constraints (ranges, allowed values, lengths)."),
      bullet("Reject data that cannot be made safe — return a clear error to the sender rather than silently discarding it."),
      bullet("Never trust data that has not been validated, even if it came from an internal source."),

      h4("Step 3 — Clean & Normalize"),
      body("Real-world data is messy. Even valid data often needs to be standardized before it can be reliably stored or compared. Cleaning and normalization happens after validation and before storage:"),
      bullet("Trim whitespace, normalize case, resolve encoding inconsistencies."),
      bullet("Standardize formats: dates to a single timezone and format, phone numbers to a single structure, currency to a single unit."),
      bullet("Resolve duplicates — if the same entity arrives from multiple sources, the system needs a strategy for which version to keep."),
      bullet("Map external identifiers to internal ones — the outside world uses its own IDs; the system should use its own."),

      h4("Step 4 — Transform & Enrich"),
      body("Transformation converts cleaned data into the shape the system actually needs. Enrichment adds information from other sources to make the data more useful:"),
      bullet("Join with reference data — translate a code into a human-readable label, or a foreign key into a full record."),
      bullet("Compute derived values — calculate a total from its components, infer a category from a set of attributes."),
      bullet("Call external services to add context — geocode an address, classify a piece of text, resolve an identity."),
      gap(40),
      callout("Trade-off", "Enrichment that calls external services introduces latency and failure points. Consider whether enrichment must happen before storage (synchronous) or can happen after (asynchronous). If a user is waiting, do the minimum needed to respond — enrich the rest in the background."),
      gap(60),

      h4("Step 5 — Store"),
      body("Storing data is not just writing it to a database. A well-designed storage strategy considers:"),
      bullet("What questions will be asked of this data? The storage structure should make those queries fast."),
      bullet("How long does this data need to be retained? Short-lived operational data and long-lived historical data have different requirements."),
      bullet("What happens if this data is lost? Some data must be durable at all costs; other data can be regenerated."),
      bullet("Who needs to access this data, and how quickly? Frequently-accessed data should be stored close to where it will be read (cache, hot storage). Historical data can live in cheaper, slower storage."),
      gap(40),
      tradeoffTable([
        ["Storage type", "Best for"],
        ["Relational (tables with rows and columns)", "Structured data with well-defined relationships; queries that join multiple entities; data that must be consistent across transactions."],
        ["Document store (flexible records)", "Data whose shape varies; entities that are always read and written together; rapid iteration on schema."],
        ["Key-value / Cache", "Data that is read far more often than it is written; session state; pre-computed results that are expensive to recalculate."],
        ["Object / Blob storage", "Large binary files — images, videos, documents, exports. Not suitable for querying; suitable for serving directly."],
        ["Time-series store", "Data where the primary query is 'what happened over this time range' — metrics, logs, sensor readings."],
        ["Message queue", "Data that needs to be processed asynchronously. The queue holds data until a consumer is ready to process it. Not a permanent store."],
      ]),
      gap(80),

      h4("Step 6 — Serve"),
      body("When a user or another system requests data, the serving layer retrieves it, applies any access controls, formats it appropriately, and returns it. Key principles:"),
      bullet("Never expose raw storage structures directly. Return data in the shape the consumer needs, not the shape it is stored in."),
      bullet("Apply access controls at the serving layer — never rely on the consumer to filter out data they should not see."),
      bullet("Cache aggressively for data that is read frequently and changes infrequently. Invalidate the cache whenever the underlying data changes."),
      bullet("Paginate large result sets — never return unbounded lists."),
      bullet("Return consistent, predictable response shapes regardless of whether the operation succeeded or failed."),

      gap(40),
      callout("When to generate the System Design Diagram", "The system design diagram should be produced at the end of this Architecture Overview phase — after the data lifecycle, storage strategy, and serving patterns are defined, but before technology choices are finalized. The diagram makes the architecture visible and exposes gaps or dependencies that prose alone may obscure. It should be updated whenever a significant architectural decision changes."),
      gap(80),

      h2("2.3  Frontend"),
      body("The frontend's job is to present data to the user and capture their intent. In a data-intensive system, the frontend is primarily a consumer of the backend's data — it should not contain business logic or make decisions about data validity. Its responsibilities are:"),
      bullet("Request data from the backend and display it in a way the user understands."),
      bullet("Capture user input and send it to the backend — validated at the surface level (is this field empty?) but not at the business level (is this user allowed to do this?)."),
      bullet("Reflect the current state of the system accurately — loading, success, error, empty."),
      bullet("Handle latency gracefully — the user should never see a blank screen while the system works."),
      gap(40),
      body("In a data-intensive system, the frontend is often listening for changes rather than just requesting them. This is where Event-Driven Architecture becomes directly visible to the user."),
      gap(80),

      // ══════════════════════════════════════════════════════════
      // SECTION 3 — SYSTEM DESIGN DIAGRAM
      // ══════════════════════════════════════════════════════════
      h1("3.  System Design"),
      body("The diagram below represents the data flow of a generic data-intensive system. It is technology-agnostic — it shows the roles and relationships between components, not which specific tools fill those roles."),
      gap(60),
      callout("When to generate this diagram", "Generate this diagram after the Architecture Overview is complete and before any technology is chosen. Use it in conversations with stakeholders to validate that everyone agrees on the shape of the system. Update it whenever a significant component is added, removed, or re-routed. A stale diagram is worse than no diagram — it creates false confidence."),
      gap(60),

      // Simplified text-based flow diagram using a table
      (() => {
        const b = { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" };
        const borders = { top: b, bottom: b, left: b, right: b };
        const box = (label, sub, color) => new TableCell({
          borders,
          shading: { fill: color, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          width: { size: 1800, type: WidthType.DXA },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 20 }, children: [new TextRun({ text: label, bold: true, size: 17, color: DARK, font: "Arial" })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: sub, size: 14, color: MUTED, font: "Arial", italics: true })] }),
          ]
        });
        const arrow = () => new TableCell({
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
          width: { size: 360, type: WidthType.DXA },
          margins: { top: 100, bottom: 0, left: 0, right: 0 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "→", size: 24, color: TEAL, font: "Arial", bold: true })] })]
        });
        return new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1800, 360, 1800, 360, 1800, 360, 1800, 360, 1800],
          rows: [
            new TableRow({ children: [
              box("CLIENT", "Browser / App", "EBF8F8"),
              arrow(),
              box("GATEWAY", "Auth · Rate Limit · Route", "D5F0F0"),
              arrow(),
              box("SERVICE LAYER", "Business Logic", "C2E8E8"),
              arrow(),
              box("DATA LAYER", "Read · Write · Cache", "B0E0E0"),
              arrow(),
              box("STORAGE", "DB · Queue · Blob", "9ED8D8"),
            ]})
          ]
        });
      })(),
      gap(40),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: "↑  Events propagate back through this chain to the client in real time via Event-Driven Architecture  ↑", size: 15, color: TEAL, font: "Arial", italics: true })]
      }),
      gap(80),

      // ══════════════════════════════════════════════════════════
      // SECTION 4 — EVENT-DRIVEN ARCHITECTURE
      // ══════════════════════════════════════════════════════════
      h1("4.  Event-Driven Architecture (EDA)"),
      body("This is the section where the call ended — so it is covered in full depth here."),
      gap(40),

      h2("4.1  What is an Event?"),
      body("An event is a record that something happened. It is a fact — immutable, past tense. It does not tell another part of the system what to do. It simply says: this thing occurred, at this time, with this data."),
      gap(40),
      codeBox("ORDER_PLACED  |  timestamp: 2026-05-28T14:32:00Z  |  orderId: 88421  |  userId: 1047  |  total: 149.99"),
      gap(60),
      body("That event does not say 'send a confirmation email' or 'update the inventory.' Those are decisions made by the services that hear the event. The event itself is neutral — it is just a fact about what happened."),
      gap(40),
      body("This distinction is the heart of Event-Driven Architecture. Instead of one service directly calling another ('do this now'), services communicate indirectly through events ('this happened — do what you need to do about it'). This decouples the services from each other."),

      h2("4.2  Why Use EDA?"),
      body("In a tightly-coupled system, Service A calls Service B directly. If B is slow, A is slow. If B is down, A fails. If you want to add Service C to also react to what A does, you have to change A's code."),
      gap(40),
      body("In an event-driven system, A emits an event to a message bus. B, C, and any future service can subscribe to that event independently. A does not know or care how many consumers exist. Services are isolated — a failure in B does not affect A or C."),
      gap(40),
      tradeoffTable([
        ["Tightly-coupled (direct calls)", "Event-driven (indirect, via events)"],
        ["A calls B directly. A waits for B to respond.", "A emits an event. A immediately continues. B processes in the background."],
        ["Adding C requires changing A.", "C subscribes to the event. A is never touched."],
        ["If B is slow, the entire request is slow.", "B's slowness does not affect A's response time."],
        ["If B is down, A's request fails.", "Events queue up. B processes them when it recovers."],
        ["Easier to understand in a small system.", "Essential for systems with multiple independent services."],
      ]),
      gap(80),

      h2("4.3  Core Vocabulary"),
      body("The following terms will appear in any conversation about EDA. Understanding them precisely matters."),
      gap(40),
      eventTermTable([
        ["Term", "Definition"],
        ["Event", "A record that something happened. Immutable. Past tense. Contains the data describing what occurred."],
        ["Event Producer", "The service or component that detects that something happened and emits the event. Does not know who will consume it."],
        ["Event Consumer", "A service that subscribes to a type of event and reacts to it. May do nothing, one thing, or many things in response."],
        ["Message Bus / Broker", "The infrastructure that receives events from producers and delivers them to consumers. Acts as the nervous system of the architecture. Producers and consumers never talk directly."],
        ["Topic / Channel", "A named stream of events on the bus. Producers emit to a topic. Consumers subscribe to a topic. Events of the same logical type live in the same topic."],
        ["Queue", "A type of channel where each event is delivered to exactly one consumer. Used when a job should be done once by one worker."],
        ["Pub/Sub", "Publish-Subscribe. A pattern where one event can be delivered to multiple consumers simultaneously. Each consumer gets its own copy."],
        ["Consumer Group", "A set of consumers that share the work of processing events on a topic. The bus distributes events across the group — each event goes to one member."],
        ["Offset / Cursor", "A marker that tracks how far a consumer has read through a stream of events. Allows consumers to replay events or resume from where they left off after a restart."],
        ["Dead Letter Queue (DLQ)", "A separate queue where events go when they cannot be processed successfully after repeated attempts. Allows the main pipeline to continue while failures are investigated separately."],
        ["Idempotency", "The property of an operation that can be performed multiple times without producing different results after the first. Critical in EDA because events can be delivered more than once."],
        ["At-least-once delivery", "A delivery guarantee where the bus ensures every event is delivered to every consumer at least once — but may deliver it more than once. Consumers must be idempotent."],
        ["Exactly-once delivery", "A stronger guarantee where the bus ensures each event is processed exactly once. Harder to achieve and more expensive. Not always necessary."],
        ["Backpressure", "A mechanism that slows down producers when consumers cannot keep up. Prevents the system from being overwhelmed by more events than it can process."],
        ["Event Schema", "The defined structure of an event — its fields, types, and constraints. A shared contract between producers and consumers. Changing a schema without coordination breaks consumers."],
        ["Schema Registry", "A central store of event schemas. Producers register their schemas; consumers look them up. Enforces that events conform to their defined shape."],
        ["Event Sourcing", "An architectural pattern where the state of a system is derived entirely from its event log. Rather than storing the current state, the system stores every event that led to that state."],
        ["CQRS", "Command Query Responsibility Segregation. Separates the path for writing data (commands) from the path for reading it (queries). Often used with EDA to allow independent scaling of reads and writes."],
        ["Saga", "A pattern for managing long-running, multi-step processes across services using events. Each step emits a success or failure event that triggers the next step or a compensating action."],
        ["Compensating Event", "An event emitted to undo a previous action when a step in a saga fails. The equivalent of a rollback in a distributed system."],
        ["Webhook", "A lightweight event delivery mechanism where a producer sends an HTTP request to a consumer's registered URL when an event occurs. Common for integrating external services."],
        ["WebSocket", "A persistent, bidirectional connection between a client and a server. Allows the server to push events to the client in real time without the client polling."],
        ["Server-Sent Events (SSE)", "A one-way persistent connection from server to client. The server streams events to the browser as they occur. Simpler than WebSockets when only the server needs to push."],
        ["Long Polling", "A technique where the client makes a request, the server holds it open until an event occurs (or a timeout), then responds. Less efficient than WebSockets but works with standard HTTP."],
      ]),
      gap(80),

      h2("4.4  Asynchronous Calls — What They Are and How They Work"),
      body("A synchronous call is one where the caller waits for the response before continuing. Imagine asking someone a question and standing in silence until they answer. The caller is blocked."),
      gap(40),
      body("An asynchronous call is one where the caller sends the request and immediately continues doing other work. The response, when it arrives, is handled by a callback, a promise, or an event. The caller is never blocked."),
      gap(40),
      codeBox("SYNCHRONOUS:   Ask → wait → wait → wait → get answer → continue\nASYNCHRONOUS:  Ask → continue doing other things → [ answer arrives ] → handle answer"),
      gap(60),
      body("In a backend system, asynchronous calls are critical for performance. If a service needs to call a database, an external API, and a cache to build a response, a synchronous system does them one after another. An asynchronous system can start all three at the same time and wait for all of them to finish — total time is the slowest single call, not the sum of all three."),
      gap(40),
      body("In an event-driven frontend, asynchronous behavior manifests in four main patterns:"),
      gap(40),

      h3("Pattern 1 — Request / Response (Async HTTP)"),
      body("The client sends a request to the backend. The backend processes it and responds. The client does not freeze while waiting — it shows a loading state and handles the response when it arrives."),
      bullet("The user clicks a button."),
      bullet("The frontend marks that section as 'loading.'"),
      bullet("The frontend sends the request and immediately returns control to the user."),
      bullet("When the response arrives, the frontend updates the UI."),
      bullet("If the request fails, the frontend shows an error state."),

      h3("Pattern 2 — Polling"),
      body("The client repeatedly asks the server whether something has changed, at a fixed interval. Simple to implement, but inefficient — most requests return 'no change' and consume resources for nothing."),
      bullet("The client sends a request every 5 seconds asking 'is there new data?'"),
      bullet("The server responds with new data if available, or an empty response if not."),
      bullet("Suitable for low-frequency updates where real-time delivery is not critical."),

      h3("Pattern 3 — Long Polling"),
      body("The client sends a request. The server holds the connection open until new data is available, then responds. The client immediately sends another request after receiving a response, creating a continuous stream."),
      bullet("More efficient than polling — no wasted requests when there is no change."),
      bullet("Adds complexity on the server side, which must manage many open connections."),
      bullet("A stepping stone toward WebSockets in systems that cannot support persistent connections."),

      h3("Pattern 4 — Persistent Connections (WebSocket / SSE)"),
      body("The client and server establish a single persistent connection. The server pushes events to the client the moment they occur — no request needed. This is the foundation of real-time interfaces."),
      gap(40),
      tradeoffTable([
        ["WebSocket", "Server-Sent Events (SSE)"],
        ["Bidirectional — client and server can both send messages.", "One-way — server sends, client listens."],
        ["More complex to implement.", "Simpler — works over standard HTTP."],
        ["Best for chat, collaborative editing, live games.", "Best for live dashboards, notifications, data streams."],
        ["Requires a server that supports persistent connections.", "Works with any HTTP server."],
      ]),
      gap(80),

      h2("4.5  How EDA Connects the Backend to the Frontend"),
      body("In a data-intensive system, the connection between EDA on the backend and the real-time frontend looks like this:"),
      gap(40),
      numbered("Something happens in the real world — a user places an order, a sensor emits a reading, a batch job completes."),
      numbered("The backend service that handles this emits an event to the message bus."),
      numbered("One or more consumer services react to the event — updating the database, sending notifications, recalculating aggregates."),
      numbered("One of those consumers is a notification service whose job is to tell clients about changes."),
      numbered("That service pushes the event to any clients connected via WebSocket or SSE who are listening for this type of event."),
      numbered("The frontend receives the event and updates the UI immediately — without the user refreshing or the client polling."),
      gap(60),
      callout("Why this matters", "The user sees changes happen in real time without any action on their part. From the architecture's perspective, each step is decoupled — the order service does not know a notification will be sent; the notification service does not know what the frontend will do with the event. Each component has one job. Adding a new consumer (say, a machine learning pipeline that analyzes orders as they arrive) requires no changes to any existing service."),
      gap(80),

      h2("4.6  Failure Handling in EDA"),
      body("Async systems fail differently than synchronous ones. When a synchronous call fails, the error is immediate and obvious. When an async consumer fails, the event may be lost, duplicated, or processed out of order unless the system is designed to handle this."),
      gap(40),
      bullet("Always acknowledge receipt of an event separately from successful processing. The bus should not mark an event as 'done' until the consumer confirms it was processed correctly."),
      bullet("Design all consumers to be idempotent — safe to run more than once on the same event, in case of duplicate delivery."),
      bullet("Use a Dead Letter Queue to capture events that cannot be processed after repeated attempts. Alert on DLQ depth — a growing DLQ is a signal that a consumer is broken."),
      bullet("Log the event ID and outcome of every processing attempt. In a distributed system, this log is the only reliable audit trail."),
      bullet("Test for out-of-order delivery. In distributed systems, two events emitted in sequence may arrive in reverse order at a consumer. Design consumers to handle this, or use event timestamps to enforce ordering where it matters."),
      gap(80),

      h2("4.7  Summary — The Full Flow"),
      body("Putting it all together, the lifecycle of data in a data-intensive, event-driven system looks like this:"),
      gap(40),
      numbered("Data enters the system through an authenticated, rate-limited entry point."),
      numbered("It is validated, cleaned, and normalized at the boundary."),
      numbered("Business logic is applied and the result is written to storage."),
      numbered("An event is emitted to the message bus: 'this happened.'"),
      numbered("Independent consumer services react: updating caches, sending notifications, running analytics."),
      numbered("A real-time delivery service pushes relevant events to connected clients via WebSocket or SSE."),
      numbered("The frontend receives the event and updates the UI without a page refresh."),
      numbered("Failures at any step are caught, logged, and routed to a Dead Letter Queue for investigation without blocking the main pipeline."),
      gap(80),
      rule(),
      gap(40),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: "End of System Architecture Plan", size: 18, color: MUTED, font: "Arial", italics: true })]
      }),

    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("output/System_Architecture_Plan.docx", buffer);
  console.log("Done.");
});