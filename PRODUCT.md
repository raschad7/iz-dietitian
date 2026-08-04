# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Qiwam serves dietitians working inside one clinic and the clients they manage. Staff dietitians use the weekly planner while reviewing a client's nutritional context, building a practical week, and deciding whether it is safe and ready to publish. Clients use the portal to view published plans and manage the client-facing parts of their clinic relationship.

## Product Purpose

Qiwam is a bilingual, RTL-first clinic-management application that brings client profiles, appointments, nutrition profiles, and weekly meal planning into one staff workflow. A successful planning session lets a dietitian understand the client's relevant clinical context quickly, assemble or review the week, and publish an appropriate plan without losing sight of safety constraints.

## Positioning

Weekly plans are built from a controlled dish catalog whose nutrition is derived from approved food data. AI can assist with generation, but it does not invent nutritional facts or bypass the dietitian's review and publishing decision.

## Operating Context

- Staff work in a dense planning interface containing a weekly board and a secondary context rail.
- The same surface must work in Arabic RTL and English LTR.
- The desktop rail becomes a sheet below the large-screen breakpoint.
- Nutrition profile editing remains a separate, dedicated route; the board's profile tab is decision support.

## Capabilities and Constraints

- The current MVP includes staff/client authentication, client profiles, appointment workflows, nutrition profiles, AI-assisted weekly plans, a controlled dish catalog, and a client portal.
- Staff data access is scoped to the clinic returned by `requireStaffClinic()`.
- Business logic stays in `src/features/<feature>/`; routes are limited to guards, data loading, and composition.
- Shared UI primitives and semantic design tokens are reused rather than recreated inside features.
- Real environment files, secrets, and generated migration snapshots remain untouched.

## Brand Commitments

The product name is Qiwam. Its existing design system uses warm neutrals, olive as the action color, lime as an accent fill, Readex Pro headings, IBM Plex Sans Arabic body text, and the logical Q-shaped Arc on interactive surfaces. Arabic is the default language and English is fully supported.

## Evidence on Hand

- Product boundaries: `docs/product-scope.md`
- Architecture and security boundaries: `docs/architecture.md`
- UI, accessibility, color, typography, and RTL rules: `docs/design-system.md`
- Current planner implementation: `src/features/weekly-plans/`
- Arabic and English product copy: `src/i18n/messages/ar.json` and `src/i18n/messages/en.json`
- No testimonials, clinical outcome claims, or external product benchmarks are available and none should be fabricated.

## Product Principles

- Put clinical safety and planning relevance ahead of decorative density.
- Keep the dietitian in control of generation, review, editing, and publishing.
- Show missing information honestly, with stronger emphasis only when it can materially affect a plan.
- Preserve one bilingual component structure using logical RTL/LTR behavior.
- Complete and validate the existing clinic workflow before adding unrelated product areas.

## Accessibility & Inclusion

Controls must remain keyboard reachable, use meaningful semantics, and meet the established contrast and touch-target rules. Arabic and English must both remain readable without separate implementations, clipped content, or physical-direction layout assumptions.
