# Weekly plans: catalog, portions and generation remediation plan

Date: 9 September 2026. Branch: `codex/weekly-plan-catalog-audit`.

This is a proposed implementation plan following the [initial audit](2026-09-09-weekly-plan-catalog.md). The earlier editor fixes are implemented; the milestones below are proposed work. Counts and evaluation thresholds below are planning targets, not established clinical standards.

## Decision and release posture

Treat today's generated week as a draft requiring a dietitian to read and correct every meal and alternative. The observed meat alternatives in a vegetarian week, silent pattern fallback, ambiguous food identities and portions are enough to reject unattended client delivery. A close weekly energy average does not establish suitability.

Build the next release around two tracks: reliable constraint enforcement, and a reviewed core of local food with practical serving controls. Prototype the data and controls with 20 common ingredient records and 12 dishes before applying them across roughly 150 food/state records and an initial 80–120 distinct dish families. Reuse, correct or retire existing entries; these are not all new additions. The current catalog already contains 146 food records and 295 dishes.

Clinical targets and patient-specific exceptions remain the dietitian's decisions. Existing condition-based prompt instructions also need clinical review; adding a diagnosis should not silently manufacture an individualized prescription. Features whose required nutrient or preparation data are unavailable must report that limitation rather than claim compliance.

## What the latest code inspection confirms

| Question | Current implementation | Consequence |
| --- | --- | --- |
| Does every call receive the whole catalog? | `actions.ts` loads active, clinic-visible, non-hidden, allergen-filtered dishes. `toPromptCatalog`/`toPromptSides` apply the current pattern filter. `prompt.ts` sends every surviving dish as a compact 14-column row. | Full recipes and ingredient lists are not sent, but the entire eligible dish list is. There is no ranked shortlist. |
| Is the list sent again? | `runReviewedGeneration` calls `runGeneration` again with the same catalog plus a draft. Slugs also occur in the response schema's meal-slot enums. | Refinement repeats the catalog; schema size also grows with the eligible dish count. |
| How large is it now? | Offline measurement of an unrestricted five-slot week: 274 mains, 21 sides; 4,666 system characters, 35,308 user characters and 13,761 JSON-schema characters. | About 54,000 characters before transport wrapping; characters are not tokens. |
| What did the provider report? | Saved refined reports: vegetarian 20,529 input tokens; teacher 18,643; multiple allergies 14,134. | These are the refinement calls' input counts, not total two-call costs. Instrument both passes separately before estimating savings. |
| Is there only ground beef? | The canonical dataset also has raw/cooked ground lamb and a pan-browned beef entry. It lacks ordinary beef/veal/lamb cuts and pieces. | Broad Arabic meat aliases can make the search seem more complete than its actual food identities. |
| Are primary ingredients solved? | The branch preserves editable primary/free flags for clinic dishes. Seed validation still caps primaries at three; plan materialization still loses `isFree`. | Persistence fixes do not solve the choice of controls, recipe grouping, serving limits or end-to-end free-serving semantics. |
| Can the source pipeline accept local data? | The builder already supports non-USDA nutrition with a source note and locally curated portions. Dish files link foods through numeric `fdcId`/`sourceRef`; non-USDA records use numbers from a reserved range. | Extend this foundation. Before adding more source types, separate internal food identity from external dataset IDs to prevent ambiguous references and future collisions. |

Relevant code: `src/features/weekly-plans/{actions,prompt,generate,queries,dataset-catalog,portioning,ingredient-units}.ts`, `scripts/{build-catalog-dataset,seed-dishes}.ts` and `data/catalog-foods.json`.

## Milestone 1 — Enforce the plan's constraints end to end

**Deliverable:** one structured, clinic-scoped eligibility decision shared by selection, sides, alternatives, variety repair and manual swap suggestions, followed by validation of the final edited plan.

- Separate allergies, ingredient exclusions, vegetarian/vegan choices and prescribed numeric limits from preferences such as repetition, cost and preparation time. A natural-language extractor can propose constraints; the dietitian can inspect their interpretation. Simple word matching cannot reliably interpret negation and exceptions.
- Derive dish facts from reviewed ingredients. Distinguish milk allergy from lactose intolerance, peanuts from tree nuts, and include the remaining relevant allergen categories. Record unknown status and product/cross-contact information separately from ingredient composition.
- Remove silent relaxation of hard constraints. If the eligible set cannot fill a slot, return a specific gap. A dietitian's deliberate change to a prescription is a recorded decision; it must not happen as a search fallback.
- Validate actual final quantities, sides and alternatives, not only base-serving tags. Define lower targets, upper limits and acceptable ranges explicitly; carry those semantics consistently through balancing and refinement.
- Validate again before publishing after any manual changes. Hard violations block completion; softer suitability findings stay visible for review. Preserve the plan version that was actually reviewed.
- Correct nearby trust issues: preserve free/portion metadata through materialization and exports; merge or reject duplicate food rows before save; align lab and production reconciliation; repair misleading lab alternative calories and pass attribution; make explanatory text describe the final meals.

**Exit checks:** all paths reject known excluded ingredients; unknown required data cannot produce a false “compliant” result; no fallback restores excluded dishes; save/reopen/edit/export retain roles, quantities and nutrition; targeted regression cases and the repository checks pass. Keep therapeutic modes that cannot meet these checks outside the validated pilot scope.

## Milestone 2 — Establish the food and portion contract using a small pilot

Implement this alongside Milestone 1's tests, before importing hundreds of entries. Reuse the existing catalog editor components and clinic ownership rules.

Every approved food record should identify:

- Arabic and English names, search aliases, category, preparation state and edible basis. Raw/cooked, skin/bone, fat level and cut matter when they change the food represented.
- An internal stable identifier; source system, external source ID, dataset release/date and matching notes as separate provenance. Preserve unknown nutrients as unknown.
- Nutrients with units and basis, including the source or calculation method. A source-verified match, a measured local food and an approximate match need distinguishable statuses; avoid an unsupported numerical AI confidence score.
- Reviewed ingredient allergens and relevant dietary facts. Unknown facts are explicit.
- One preferred client-facing portion and a short alternate menu. Each portion has a stable key, Arabic/English description, preparation state, grams of edible food, practical increment, applicable serving bounds, evidence and reviewer/date.
- A review lifecycle: candidate → matched/checked → dietitian reviewed → active, plus rejected/retired states. An approved food version remains reproducible after later updates.

### Units are specific to the food and state

| Food | Proposed presentation | What must be established |
| --- | --- | --- |
| Cooked rice | عدد ملاعق أكل ممتلئة, with a secondary gram equivalent; a cup may be optional | Distinguish a heaped eating spoon from a level measuring tablespoon. The existing 25 g entry is a local calibration to confirm, not a universal conversion. |
| Chicken breast | وزن مطبوخ بدون جلد أو عظم; optional named piece size | Cooking method and edible cooked weight. A “piece” or a person's palm is not a precise universal mass. |
| Beef/veal/lamb pieces | Species/local name + preparation, with cooked edible grams | Cut/fat assumption and bone exclusion. Offer a measured piece example only where useful and repeatable. |
| Apple, orange, banana | حبة متوسطة with size guidance | Edible weight and what “medium” means for that fruit. |
| Grapes | Count where practical, otherwise a measured bowl/weight | Size varies; an exact universal weight per grape should not be implied. |
| Pita/taboon | A specified loaf, half or quarter | Bread type, size/diameter or package and weight. |
| Labneh/tahini/oil | Specified measured spoon or local portion | Level/heaped distinction and food-specific mass. Oil in a mixed recipe stays part of that recipe. |
| Mixed dishes | A reviewed ladle, cup, piece or plate serving | Finished recipe yield and serving mass, including separately served components. |

Store portion increment and identity as data. Current code keys increments and recipe references on English labels, so changing a label such as “Tablespoon” can change behavior or break matching. Migrate existing references before renaming. A unit switch preserves food mass; snapping to a practical serving is a separate visible adjustment that recalculates nutrition.

Use repeated local weighings across representative servings to establish practical portions. Record utensil/size, state, sample count, typical weight and observed variation. Start with roughly 10–15 high-use household measures; direct weights can remain the preferred option for other foods. Keep cooked plan amounts distinct from raw shopping/preparation quantities.

### Pilot scope

Use 20 food/state records spanning cooked rice, breads, chicken, ordinary red-meat pieces, eggs, cooked legumes, labneh/yogurt, fruit, vegetables, olive oil and tahini. Include a currently missing meat identity and a local ingredient so the pilot exercises both source pathways.

Use 12 dishes across assembled plates, mixed dishes, breakfast, snacks and fixed/restaurant servings. Candidate examples: chicken–rice plate, meat–rice plate, mujaddara, maqluba, musakhan, mansaf, maftoul with chicken, labneh breakfast, eggs with bread, fruit snack, lentil soup and a sandwich. A dish enters the pilot only when its required ingredient identities and preparation are supportable; otherwise its gap is an explicit pilot finding.

**Exit checks:** the dietitian can read each serving aloud as a usable client instruction; changing portions behaves predictably; displayed measures and nutrition agree; create/reopen/clone/save/export preserve the chosen interpretation in Arabic and English, desktop and mobile.

## Milestone 3 — Replace primary flags with meaningful serving controls

Define “primary” as a component a client can reasonably portion independently in the served meal. Nutritional importance alone does not make an ingredient independently adjustable.

| Dish example | Controls to offer | Relationship to preserve |
| --- | --- | --- |
| Chicken + rice + salad | Chicken amount; rice amount; salad portion if relevant | Each separately served component moves independently. |
| Mujaddara | Finished mujaddara serving; separately served salad/yogurt | Rice, lentils, onions and incorporated oil move together. |
| Maqluba | Mixed rice/vegetable serving; chicken only if served separately | Do not pretend the client can separately remove the cooked-in oil or vegetables. |
| Mansaf | Meat, rice and jameed sauce where separately served | Use a validated local recipe, not ground lamb and ordinary yogurt as hidden replacements. |
| Egg/cheese sandwich | Whole/half sandwich; a filling amount only for a deliberately customizable version | A bought sandwich follows its actual portion options; preparation source alone should not ban sensible halves. |
| Fruit snack | Number/size of fruit or a named cut portion | No need for extra controls just to reach a fixed count. |

Separate **recipe editing** from **serving adjustment**. Changing lentil-to-rice ratio creates a recipe variation; reducing a serving of cooked mujaddara keeps that ratio. Store component groups, default amounts, permitted units/increments, locks and plausible bounds. Bounds should be dish-specific with explicit clinical constraints layered on top. Do not force an unsuitable dish to reach a calorie target by escalating oil or another dense ingredient.

AI can propose controls with a short explanation; catalog authors review them once and clinics can clone/override with provenance. Allow zero, one or several meaningful controls. Keep a small default visible set for usability, with additional controls expandable; do not encode a fixed number as nutritional truth. Align seed and editor validation.

Replace ambiguous “free” semantics with a reviewed flexible-portion behavior. It must not mean zero nutrition, unlimited intake or exemption from exclusions. Dressings and other ingredients still count. Keep all recipe ingredients available for dietitian inspection even when the client sees a simpler serving description.

**Exit checks:** assembled components move independently; mixed recipe ratios survive every serving adjustment; changes recalculate all affected nutrients; persistence/export preserve grouping; no impossible or misleading instructions are produced by the tested adjustment ranges.

## Milestone 4 — Expand the core catalog in reviewed batches

### Ingredient scope

Aim for about **150 approved food/state records**, prioritizing current recipe use, the dietitian's ordinary plans, missing local staples and restricted-profile gaps. Current reference counts help order work: olive oil occurs in 163 recipe lines, cooked white rice in 60, roasted chicken breast in 36 and cooked ground beef in 34. These reflect the existing catalog's biases, so missing foods need a separate priority list.

| Working allocation | Records |
| --- | ---: |
| Grains, bread and other starches | 24 |
| Meat, poultry, fish and eggs | 26 |
| Dairy and relevant alternatives | 18 |
| Legumes | 12 |
| Fruit | 20 |
| Vegetables | 22 |
| Oils, nuts, seeds and spreads | 16 |
| Seasonings and local specialty ingredients | 12 |
| **Initial budget** | **150** |

These counts are adjustable. They count distinct preparation-state records, not 150 unrelated food names. Do not import every USDA cut or duplicate foods solely for alternate spelling.

For meat, propose clearly named common records such as لحم عجل قطع للطبخ، لحم بقري قطع، لحم خروف قطع, plus the locally useful grilled/stewed preparations and existing ground options. Confirm what “عجل” means in the clinic's usage before matching it to USDA “veal.” Capture a representative cut/fat assumption in the source mapping and expose meaningful distinctions in search. “لحم عادي” is a search phrase that should reveal these choices, not a new food with invented average values.

Local gaps include cooked freekeh, maftoul, jameed, Nabulsi/Akkawi cheese, taboon bread, za'atar blend and sumac. Salt and cooking fats also need explicit recipe treatment. Labneh, molokhia and olives already exist and need review rather than duplicate identities.

### Acquisition and validation pipeline

Use AI to research, extract, match and prepare review cards in bulk. Activate entries in small reviewed batches, approximately 15–25 foods or 10–15 dishes at a time.

1. Define the local food/dish and why it fills a gap.
2. Collect source candidates with URL, date, source rights and the exact preparation/portion described. Prefer APIs/downloads for structured databases. Recipe sites can inform candidates; store permission-appropriate data and independently written preparation summaries, without copying photos or long recipe text.
3. Match ingredients to the appropriate nutrient record; document disagreements and unsupported matches. Preserve the external ID and original description.
4. Establish local portion descriptions/weights. USDA composition and local serving calibration are different evidence.
5. For a dish, record ingredient amounts, method, finished yield, edible serving and any drained fat/liquid. Calculate nutrition consistently. Do not apply cooking loss twice when using cooked ingredient values.
6. Run structural and nutrition checks: identity/state consistency, units and grams, missing values, plausible totals, allergens, duplicates, component behavior and profile coverage. Treat outliers as a review queue; a simple 4/4/9 energy check is not proof that the source is wrong or the meal is valid.
7. Present a compact Arabic/English review card with the source match, client instruction, controls and unresolved assumptions. Dietitian review confirms local meaning and practical use.
8. Activate a versioned batch; regenerate evaluation weeks and compare them with the baseline. Retire superseded recipes without changing historical published plans.

USDA FoodData Central provides an API and public-domain/CC0 data suitable for this process. It does not certify an imported local recipe as valid. [USDA API and licensing](https://fdc.nal.usda.gov/api-guide/).

Choose source types deliberately: Foundation Foods supplies composition data for many basic foods, FNDDS includes consumed foods and portion weights, branded entries derive from labels, and SR Legacy is historical. Prefer the best food match rather than automatically replacing every older record with a newer, different food. [USDA data-type documentation](https://fdc.nal.usda.gov/data-documentation/).

Use regional tables or exact local product labels where they represent the food better. The [FAO regional directory](https://www.fao.org/infoods/infoods/tables-and-databases/middle-east/en/) is a discovery starting point; evaluate each source's suitability and reuse terms. [FAO food-matching guidance](https://www.fao.org/4/ap805e/ap805e.pdf) supports explicit matching and preparation distinctions. Recipe calculations require appropriate treatment of cooked yield and nutrient retention; a USDA match for each ingredient alone does not establish the finished serving. [FAO recipe-calculation procedure](https://www.fao.org/4/y4705e/y4705E23.htm).

### Dish scope

Start with 80–120 distinct, reviewed dish families covering normal breakfasts, packed sandwiches, simple lunches, family dishes, dinners, sides and snacks. Correct the useful existing 295 entries first. Count a small/medium/large version as one family; grow the count only where it adds usable coverage. Simple plates can use reviewed component combinations instead of dozens of nearly identical hand-authored rows. Special restaurant versions should retain their specific assumptions and uncertainty.

**Exit checks:** every active core entry has provenance, reviewed identity/state, practical serving and constraint facts appropriate to its use; every dish uses approved records and has a reproducible serving calculation; restricted-profile coverage improves without relaxing exclusions.

## Milestone 5 — Bound the catalog sent to the model

Implement after the shared eligibility decision, before substantial catalog growth. It is lower priority than wrong selections but already measurable enough to plan now.

Flow: clinic-visible catalog → hard eligibility → practical portion feasibility → ranked, diverse candidates by meal type → compact model selection → deterministic portioning → final validation.

- Start with transparent filters and scoring: meal type, achievable serving range, available preparation, preferences, recent dishes, cost, recipe family and protein/starch diversity. Do not score solely by calorie proximity.
- As an initial experiment, shortlist roughly 15–25 mains per required meal type and a small compatible side pool; this might yield 60–100 unique candidates for a normal week. Adjust from evaluation results rather than enforcing that range regardless of coverage.
- Pin explicit dietitian choices and retain sufficient variety and constraints coverage. Keep the shortlist stable between first pass and refinement. Expand only within the eligible catalog when a slot lacks feasible choices; otherwise report the gap.
- Offer concise dish/component summaries and achievable serving ranges. Keep the full recipes server-side and available in the editor. Build response enums from exactly the offered set; validate every returned ID.
- Keep alternatives within the same eligible, compatible set. A repair using an eligible candidate outside the shortlist must be logged and reflected in the final explanation.
- Cache catalog-derived metadata by clinic/catalog version. Any client-specific candidate caching must also account for current constraints and targets. Never reuse another clinic's visibility or a stale allergy decision.
- Add embeddings only if later vocabulary/search evaluations show a need. Similarity search does not enforce exclusions or replace portion feasibility.

Instrument candidate counts, schema/prompt size, provider tokens per pass, latency, retries, discarded refinements, infeasible slots and accepted-plan quality. Compare full eligible catalog versus shortlist on the same synthetic cases. A proposed optimization goal is at least 40% less input usage without worse hard-constraint results or clinician-rated suitability; it is a benchmark goal, not a promised saving.

## Milestone 6 — Prove client readiness and roll out gradually

Build a fixed, versioned evaluation set of at least 20 synthetic profiles, with three generation repeats per profile. Include ordinary local eating patterns, three/five meals, vegetarian, multiple exclusions, low/high energy needs, work meals, dislikes, limited cooking and eligible prescribed patterns. Include deliberate empty/unknown-data cases. Clinical cases outside supported data remain explicit exclusions from the release claim.

Automatically check every main, side and alternative for valid identity and hard constraints; recompute meal/day totals from final grams; flag target-range misses and implausible amounts; check readable units, component ratios, repetition of whole meals, schedule and summary consistency. Test one-day/one-meal regeneration and manual edits as well as whole-week creation.

Dietitian review of an initial 10–15 representative weeks should score local realism, practical portions, controllability, shopping/preparation burden, suitability and correction time. Agree acceptable numeric ranges with the dietitian; do not present arbitrary calorie tolerances as clinical standards. Measure whether clients can interpret sample instructions without repeated clarification during a small, consented pilot.

Release gates: zero known hard-constraint violations in the evaluation set; no silent missing-data assumptions; correct board/export/published snapshots; all pilot weeks reviewed; documented correction-time and suitability results. Passing the suite is bounded evidence, not a guarantee for every future client.

Roll out the reviewed core first. Preserve existing records and historical plans; make catalog batch rollback possible. Expand after reviewing rejected suggestions, frequently changed amounts and search gaps. Keep client identity and free-text health details out of routine diagnostic logs.

## Who does what next

**Agent/engineering:** implement Milestone 1; prepare the 20-food/12-dish pilot cards and source candidates; build the portion/component behavior and staged import checks; run the evaluations and assemble reviewable results. No production bulk import is required to make these decisions concrete.

**Dietitian:** confirm the clinic's local meanings of meat names; choose the phrases clients understand for rice, bread, fruit and meat; review the pilot dishes and component controls; supply/calibrate a small set of common household measures; define patient-specific targets and approve clinical rules. Existing de-identified plans can guide frequency and realism. Review prepared batches rather than manually researching every nutrient record.

The first decision session should use the pilot cards, especially chicken/rice, meat/rice, mujaddara and maqluba. Resolve serving language and what can move independently on those examples. Then scale the proven rules to the core 150 and the dish families.

## Implementation order and dependencies

| Step | Deliverable | Dependency / handoff |
| --- | --- | --- |
| 1 | Constraint enforcement and trustworthy final validation | Immediate engineering work; clinical interpretation reviewed where needed |
| 2 | Food/portion contract + 20-food pilot cards | Source research can proceed alongside step 1 |
| 3 | Component controls + 12-dish pilot | Uses step 2; dietitian reviews concrete servings |
| 4 | Candidate shortlist and per-pass instrumentation | Uses step 1; benchmark against the pilot and current full catalog |
| 5 | Reviewed core of ~150 foods and 80–120 dish families | Uses steps 2–3; activated incrementally through the validated engine |
| 6 | Repeated generation evaluations and clinician/client pilot | Repeats after each batch; required before broader rollout |

Calendar estimates should follow the first pilot because local source availability and physical serving calibration determine the catalog work. Each step should land as a focused, reviewable change with appropriate tests; UI changes also require Arabic/English and mobile/desktop checks plus `bun run lint`, `bun run typecheck` and `bun run test`.
