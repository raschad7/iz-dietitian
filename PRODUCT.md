# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Enzyme serves dietitians working inside one clinic and the clients they manage. Staff dietitians use the weekly planner while reviewing a client's nutritional context, building a practical week, and deciding whether it is safe and ready to publish. Clients use the portal to view published plans and manage the client-facing parts of their clinic relationship.

## Product Purpose

Enzyme is a bilingual, RTL-first clinic-management application that brings client profiles, appointments, nutrition profiles, and weekly meal planning into one staff workflow. A successful planning session lets a dietitian understand the client's relevant clinical context quickly, assemble or review the week, and publish an appropriate plan without losing sight of safety constraints.

## Positioning

Weekly plans are built from a controlled dish catalog whose nutrition is derived from approved food data. AI can assist with generation, but it does not invent nutritional facts or bypass the dietitian's review and publishing decision.

## Operating Context

- Staff work in a dense planning interface containing a weekly board and a secondary context rail.
- The same surface must work in Arabic RTL and English LTR.
- The desktop rail becomes a sheet below the large-screen breakpoint.
- Nutrition profile editing remains a separate, dedicated route; the board's profile tab is decision support.

## Capabilities and Constraints

- The current MVP includes staff/client authentication, client profiles, appointment workflows and requests, nutrition profiles, AI-assisted weekly plans, a canonical food catalog with an editable dish catalog, a client portal, clinic onboarding and settings, in-app notifications, a guided user tour, and optional WhatsApp automation.
- Staff data access is scoped to the clinic returned by `requireStaffClinic()`.
- Business logic stays in `src/features/<feature>/`; routes are limited to guards, data loading, and composition.
- Shared UI primitives and semantic design tokens are reused rather than recreated inside features.
- Real environment files, secrets, and generated migration snapshots remain untouched.

## Brand Commitments

The product name is Enzyme (Arabic: إنزيم); it was previously called Qiwam / قوام, and dated design records still carry the old name. The mark is a leaf carrying two seeds beside the Arabic wordmark, drawn from the single path source in `src/features/brand/logo.ts`. There is one green family: the brand green `#75CF48` is also `--primary`, so the logo and every primary action are one colour, and no second "lime" accent ramp exists any more. Warm neutrals (`--n-*`) carry text, borders, and cards; cool neutrals (`--c-*`) carry muted surfaces, the sidebar, and the planner grid. Type is Almarai for Arabic, Readex Pro for English headings, and IBM Plex Sans / IBM Plex Sans Arabic for body. Arabic is the default language and English is fully supported.

## Evidence on Hand

- Product boundaries: `docs/product-scope.md`
- Architecture and security boundaries: `docs/architecture.md`
- UI, accessibility, color, typography, and RTL rules: `docs/design-system.md`
- Current planner implementation: `src/features/weekly-plans/`
- Brand mark, colours, and lockups: `src/features/brand/logo.ts` and `public/brand/`
- Semantic design tokens: `src/app/globals.css`
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
