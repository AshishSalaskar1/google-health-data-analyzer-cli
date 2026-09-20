# Health Connect Studio

Health Connect Studio is a private, browser-based explorer for Google Health Connect SQLite exports. It turns an archive into understandable activity, heart, exercise, sleep, recovery, body, and overall-health views, with an optional Azure AI health coach.

The interface uses an Apple Health-inspired information hierarchy and data-visualization approach without copying Apple assets or proprietary health formulas. The raw archive is queried locally in a Web Worker and is never uploaded.

## Features

- Summary-first health overview with activity, sleep, exercise, and heart trends.
- Interactive activity and heart-rate charts with date-range and source filters.
- Exercise history, intensity comparison, and per-session heart-rate traces.
- Recorded sleep-stage timelines and nightly Sleep Consistency comparisons.
- Nightly HRV, resting heart rate, breathing, and skin-temperature trends.
- Body and vital trends, including weight and respiratory measurements.
- Source attribution, archive coverage, missing-data states, and quality notes.
- Light and dark themes available before and after archive import.
- Local HTML report export and AI coach conversation PDF export.
- Responsive desktop and mobile layouts with keyboard and screen-reader support.

## Overall Health and Body Age

Overall Health combines five visible categories:

- Movement
- Training
- Sleep
- Cardio
- Body

The health flower fills each petal in proportion to that category's score. Missing wearable data lowers confidence rather than lowering the score.

The optional **Get my Body Age** flow uses age, height, weight, and visible wellness scores to produce a transparent wellness estimate. Gender can be retained as profile context, but it does not silently alter the current local scoring formula. Profile details are stored in the browser and can be edited or erased.

Body Age is not biological age, a diagnosis, or a reproduction of a proprietary device score. AI is invoked only after the user explicitly requests an explanation.

## Sleep and Recovery

For a multi-day range, Sleep Consistency shows the recorded stage mix and duration for each night. Selecting a night updates its sleep-stage timeline and recovery values without changing the global date filter.

### Detailed sleep metrics

Alongside time in bed, time asleep, and efficiency, the Sleep view derives additional descriptive metrics directly from recorded Health Connect sleep-session and sleep-stage data:

- **Sleep latency** – time between the start of the session and the first recorded asleep stage.
- **Awake after sleep onset (WASO)** – recorded awake minutes between falling asleep and the final asleep stage, distinct from total awake time.
- **Longest awake stretch** – the longest single recorded awake stage in the session.
- **Fragmentation** – recorded awakenings per hour asleep, as a continuity indicator.
- **REM / deep / light composition** – minutes and percentage of recorded sleep in each stage.
- **Sleep schedule consistency** – the night-to-night spread of recorded bed and wake clock times across the selected period (lower spread means more consistent timing; requires at least two recorded nights).

These are descriptive measurements derived entirely from your archive's recorded sleep-session and sleep-stage rows. They are not medical advice, a diagnosis, or a substitute for clinical sleep assessment. When a night has no recorded sleep stages, stage-dependent metrics (latency, WASO, longest awake stretch, and stage composition) are shown as explicitly "Not recorded" rather than inferred — a missing value reflects missing sensor data, not necessarily poor sleep.

Recovery Context can compare these measurements by night when present:

- Heart-rate variability (HRV)
- Resting heart rate
- Respiratory rate
- Skin-temperature delta

Missing measurements remain visible as gaps or explicit unavailable states. For a single-day range, the app also shows the detailed overnight heart-rate trace.

## Run Locally

### Requirements

- A recent Node.js release
- npm
- Optional: an Azure OpenAI-compatible model deployment for Body Age explanations and the AI coach

### Install

```bash
npm install
cp .env.example .env
```

Configure `.env` if AI features are required:

```dotenv
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com/openai/v1
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=2024-10-21
PORT=3000
```

### Development

Run the API and Vite development servers in separate terminals:

```bash
npm run dev:server
```

```bash
npm run dev
```

Alternatively, start both processes together:

```bash
npm run dev:all
```

Open the Vite URL and choose `data/health_connect_export.db` or another compatible Health Connect SQLite export. Vite proxies `/api` requests to the Node server on port `3000` by default.

The archive explorer works without Azure configuration. AI-backed Body Age explanations and Coach requests require the API server and valid Azure settings.

## Build and Test

```bash
npm run build
npm test
```

Preview the production frontend:

```bash
npm run preview
```

Run the Node API directly:

```bash
npm start
```

## Privacy Model

- SQLite processing happens in a Web Worker inside the browser.
- The original archive is never uploaded to the backend or Azure.
- Queries are read-only and never modify the imported file.
- The database remains in browser memory and is cleared on refresh or tab close.
- Theme, Body Age profile details, coach profile, conversation history, and weekly plans may persist in browser local storage.
- Body Age explanations send only the profile, calculated assessment, coverage, and selected period after an explicit request.
- Coach requests send the question, profile context, and purpose-selected aggregate health evidence after explicit consent.
- The model cannot execute arbitrary SQL or access the raw archive.
- Reports and coach PDFs contain private summaries and should be stored and shared accordingly.

## AI Coach Architecture

The application uses only the configured Azure OpenAI-compatible endpoint. Azure AI Search, Hosted Agents, Functions, Storage, and a managed database are not required.

1. A context-planning model call selects up to four bounded health-data requests and their granularity.
2. Typed browser tools execute those requests against the local SQLite archive.
3. Activity, sleep, heart, exercise, and vitals specialists are invoked only when matching evidence exists.
4. Public wellness guidance is retrieved from `knowledge/guidance.json` using local lexical scoring.
5. A coordinator produces the response or weekly plan.
6. A final model call reviews groundedness and safety.
7. A deterministic emergency-language gate can bypass normal coaching and direct the user to immediate help.

Health and guidance evidence is displayed with each coach response. The local guidance corpus should receive clinical review and regular updates before production use.

## Supported Data

The app uses table-capability checks and is verified against the included Health Connect schema version 26 archive. Supported records include:

- Steps, distance, and energy
- Heart-rate series
- Exercise sessions
- Sleep sessions and stages
- Weight
- Resting heart rate and HRV
- Respiratory rate and skin temperature
- Oxygen saturation and blood pressure
- Hydration
- Source attribution and record coverage

Optional tables and empty metrics are handled without failing the analysis.

## Current Limitations

- Compatibility with every Health Connect schema version is not guaranteed.
- Formal cross-source deduplication is outside the current scope.
- Exercise steps, distance, and energy are overlap estimates because Health Connect stores those records independently from exercise sessions.
- Sleep stages are displayed as recorded; the app does not infer sleep-cycle boundaries. Detailed sleep metrics (latency, WASO, fragmentation, stage composition, schedule consistency) are derived only when the underlying data is present and are descriptive, not diagnostic.
- Wellness scores and Body Age are descriptive estimates, not medical assessments.
- The coach does not diagnose conditions, prescribe treatment, direct medication changes, or replace emergency care.
