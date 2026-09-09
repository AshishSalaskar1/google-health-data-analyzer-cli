---
name: Health Studio
description: A private personal health library for understandable wearable trends.
colors:
  action-blue: "#0a84ff"
  activity-green: "#30b94d"
  heart-pink: "#ff375f"
  exercise-orange: "#ff9f0a"
  sleep-indigo: "#5e5ce6"
  canvas-gray: "#f2f2f7"
  surface-white: "#ffffff"
  ink-black: "#1c1c1e"
  secondary-gray: "#6e6e73"
  divider-gray: "#d1d1d6"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "clamp(42px, 4vw, 62px)"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  control: "9px"
  surface: "14px"
  pill: "22px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "22px"
  xl: "44px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  grouped-surface:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.surface}"
    padding: "22px"
---

# Design System: Health Studio

## Overview

**Creative North Star: "The Personal Health Library"**

Health Studio organizes a private archive as a calm, dense library of measured signals. The interface borrows the summary-first clarity and restrained data graphics of excellent native health software, but its desktop composition is a deliberate analysis workspace rather than a mobile screen enlarged to fill a monitor.

The visual identity comes from semantic category color, grouped measurement surfaces, tabular values, sparse charts, and compact navigation. Color is information: green identifies activity, pink identifies heart data, orange identifies exercise, indigo identifies sleep, and blue identifies actions or general navigation.

**Key Characteristics:**
- Cool neutral canvas with white grouped surfaces.
- Category color used consistently across icons, charts, and navigation.
- Dense desktop comparison and a fully restructured mobile reading order.
- Plain language, visible privacy boundaries, and no decorative scoring chrome.

## Colors

The restrained neutral field keeps long analysis sessions comfortable while saturated health colors remain immediately legible.

**The Category Continuity Rule.** A health category keeps one color across its icon, chart, legend, and selected navigation state; color never changes merely to create variety.

**The Action Blue Rule.** Blue identifies general actions and selection. Do not use it as a decorative wash behind unrelated content.

## Typography

**Display Font:** Native humanist system stack with platform fallbacks.
**Body Font:** The same stack for consistent instrument-like rhythm.

**Character:** Compact and highly legible, with strong large titles and quiet supporting copy. Measurements use tabular numerals so comparisons remain stable.

### Hierarchy
- **Display** (750, fluid 42-62px, 1): section identity and import statements.
- **Title** (700, 21px, 1.2): grouped surface and chart headings.
- **Measurement** (650-720, 23-27px): primary values with tabular numerals.
- **Body** (400, 15px, 1.5): explanations, capped near 75 characters where possible.
- **Label** (500, 12-13px): category and supporting metadata in sentence case.

**The Measurement First Rule.** In data surfaces, category, value, and unit create the hierarchy; do not add decorative pre-headings.

## Layout

Desktop uses a 252px category rail and a fluid workspace capped at 1440px. The summary starts with a wide daily ribbon, a continuous metric group, linked health rows, and asymmetric chart columns. Major gaps are 44px; grouped content uses 16-22px internal spacing.

Below 720px, content uses 16px page gutters, metric groups become continuous rows, and all nine destinations move to a visible two-row bottom library bar. Charts and ribbons scroll or reflow instead of compressing labels into unreadable columns.

## Elevation & Depth

Tonal layering creates most depth: canvas, surface, raised surface, and divider. The ambient shadow (`0 10px 30px rgba(0, 0, 0, .07)`) is reserved for the import surface and floating composer; ordinary health groups remain flat.

**The Flat Analysis Rule.** Data surfaces use grouping and contrast, not repeated drop shadows.

## Shapes

Grouped health surfaces use a 14px radius, compact controls use 8-10px, and small primary actions use pill geometry. Category icons sit in compact 9-14px rounded wells. Borders separate rows inside a group rather than outlining every container.

## Components

### Buttons
- **Primary:** Action blue, white text, 44px minimum height, pill corners.
- **Secondary:** Neutral grouped surface or pale semantic tint with category-colored text.
- **Focus:** A visible 3px semantic outline with separation from the component edge.

### Segmented Controls
- Use a neutral inset track, compact 7px selections, and a subtle structural shadow on the selected segment.
- Labels stay sentence case and short enough to scan as a single control.

### Cards / Containers
- Group related measurements in one white 14px surface.
- Separate repeated values with dividers instead of independent cards and shadows.
- Use 16px mobile and 22px desktop padding.

### Inputs / Fields
- Use a white or raised-neutral field with 8-10px corners.
- Transfer keyboard focus to the visible enclosing control when the native input is visually hidden.

### Navigation
- Desktop presents every health category in a fixed library rail with a category-colored icon and quiet selected field.
- Mobile presents all destinations in a visible two-row bottom bar; do not hide destinations behind unmarked horizontal overflow.

### Health Day Ribbon

The ribbon is the signature summary component. It combines daily sleep, steps, and workout coverage in compact parallel columns with labels and a legend, preserving missing data as visible absence.

## Do's and Don'ts

### Do:
- **Do** use category color to preserve wayfinding from summary to detail.
- **Do** align measurements with tabular numerals and restrained units.
- **Do** use grouped rows when values belong to one health concept.
- **Do** design desktop and mobile as distinct compositions using the same components.

### Don't:
- **Don't** copy proprietary Apple marks, SF Symbols, or exact Apple Health screens.
- **Don't** stretch a single mobile column across desktop width.
- **Don't** use gradients, glowing edges, or generic dashboard decoration around data.
- **Don't** treat missing wearable coverage as a low score or negative state.
- **Don't** add uppercase eyebrows or labels that repeat the heading below them.
