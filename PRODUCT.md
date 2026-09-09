# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Adults reviewing their own Health Connect wearable archive for understandable personal wellness trends and practical next steps.

## Product Purpose

Health Studio turns a local Health Connect database into browsable activity, heart, exercise, sleep, recovery, and overall-health summaries. Success means users can understand the whole picture without surrendering control of their raw archive.

## Positioning

The product analyzes the original read-only archive in browser memory, while cloud AI is explicit and opt-in for selected summaries rather than the entire database.

## Operating Context

Users import a Health Connect SQLite export, select a date range and source, inspect measured trends, optionally provide personal profile details, and explicitly invoke AI explanations.

## Capabilities and Constraints

- Raw archives remain in browser memory and are never uploaded.
- Profile details persist in the user's browser. A minimal profile and aggregate metric snapshot may be sent to cloud AI only after an explicit action.
- Overall health and body age are transparent wellness estimates, not diagnoses, biological-age tests, or reproductions of a proprietary device formula.
- Missing wearable coverage must remain visible and must not be silently scored as poor health.

## Evidence on Hand

The imported Health Connect archive supplies activity, exercise, sleep, heart-rate, HRV, respiratory, temperature, weight, and source coverage where recorded. Public-health guidance may support clearly identified reference ranges; no clinical outcomes, laboratory biomarkers, testimonials, or proprietary body-age methodology are available.

## Product Principles

- Keep raw personal health data local by default.
- Separate measurements, estimates, and possible interpretations.
- Make every score explainable from visible inputs.
- Treat missing data as uncertainty, not failure.
- Require an explicit user action before cloud AI receives a summary.

## Accessibility & Inclusion

Core information and interactions must work with keyboard navigation, visible focus, screen readers, reduced motion, and without relying on color alone.
