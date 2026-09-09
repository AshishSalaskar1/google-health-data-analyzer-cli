# Health Connect Studio: React POC Plan

## Goal

Build a browser-only React application that imports a Google Health Connect SQLite export, explores useful health trends, and exports the selected view as a standalone interactive HTML report.

The database stays in browser memory. There is no Python service, backend, upload, account, or persistence between sessions.

## Architecture

```text
Imported .db file
      |
Browser File API
      |
Web Worker + sql.js
      |
Health Connect queries and aggregation
      |
React dashboard
      |
Standalone HTML report
```

## Scope

- React, TypeScript, and Vite.
- SQLite processing with `sql.js` in a Web Worker.
- Target the supplied schema version 23 database for this local POC.
- Validate the SQLite header and required Health Connect tables.
- Read the imported database without modifying it.
- Keep the imported file in memory only until refresh or tab close.
- Support overview, activity, heart, exercise, body, sleep, sources, and data-quality views.
- Support date range, source application, and metric/imperial filters.
- Generate a self-contained interactive HTML report containing aggregated data only.
- Manually verify against `data/health_connect_export.db`; no automated test suite for the POC.

## Core Metrics

- Steps by day and hour, totals, daily average, and goal progress.
- Distance and total calories.
- Heart-rate minimum, average, maximum, and timeline.
- Exercise count, type, duration, and session list.
- Latest weight and trend when enough measurements exist.
- Sleep duration and stages when present.
- Resting heart rate, HRV, oxygen saturation, blood pressure, hydration, and body composition when present.
- Source application contribution and data coverage.
- Missing, overlapping, unavailable, and malformed-data warnings.

## Interface

- Drag-and-drop import screen with a local-privacy explanation.
- Responsive application shell with sidebar navigation.
- Shared filter bar for reporting period, source, and units.
- Dense but legible health-journal visual language with an activity ribbon as the signature overview element.
- Interactive charts, summary cards, tables, empty states, and quality notes.
- Export action available throughout the workspace.

## Implementation Order

1. Scaffold the Vite React TypeScript application.
2. Add import, SQLite validation, and a `sql.js` Web Worker.
3. Implement schema discovery, source discovery, and normalized metric queries.
4. Build the dashboard shell and metric views.
5. Add date, source, and unit filters.
6. Add standalone interactive HTML export.
7. Run a production build and manually validate calculations against the sample database.
8. Document local setup, supported data, privacy, and POC limitations.

## POC Acceptance Criteria

- A user can import `data/health_connect_export.db` from the browser.
- The supplied schema version 23 export renders without a backend.
- Overview, activity, heart rate, exercise, weight, and source information are correct.
- Empty sleep and vitals data result in useful empty states.
- Filters update all relevant views.
- Export downloads a polished HTML report that opens without a server.
- Refreshing clears the imported health database.
- The original database is never modified or uploaded.
