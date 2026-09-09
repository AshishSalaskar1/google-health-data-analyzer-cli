# Health Connect Studio

A browser-only React POC for exploring a Google Health Connect SQLite export. Import a `.db` file, inspect useful health trends, filter by date or source, and download a standalone HTML report.

## Run Locally

Requires a recent Node.js release.

```bash
npm install
npm run dev
```

Open the local Vite URL and choose `data/health_connect_export.db` or another compatible Health Connect export.

Create a production build with:

```bash
npm run build
```

## Privacy

- Database processing happens inside a Web Worker in your browser.
- The file is not uploaded or sent to a backend.
- The database stays in memory and is cleared on refresh or tab close.
- Queries are read-only and never modify the imported file.
- HTML exports contain aggregated report data, not the original database, UUIDs, routes, icons, or medical resources.

Exported reports still contain private health summaries. Store and share them accordingly.

## POC Scope

The app targets the supplied Health Connect schema version 23 export. It supports steps, distance, calories, heart-rate series, exercise sessions, weight, sleep, resting heart rate, HRV, oxygen saturation, blood pressure, hydration, source attribution, and availability states. Empty metrics are handled without errors.

This tool is informational and does not provide medical diagnosis or advice. Broader schema compatibility, formal deduplication, and automated tests are outside the local POC scope.
