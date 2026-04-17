# AGENTS.md

Repository guidance for future Codex tasks in `iamresist_v2`.

## Product Intent

- `iamresist` is an observer / accountability media platform.
- The site should feel like: "We the people are watching."
- Trusted creators and video curators are not noise; they are an editorial signal.
- Other desks should corroborate, verify, and expand what trusted creators are surfacing.
- The ranking system should suppress off-mission noise without over-interpreting the feeds.

## Editorial Principles

- Prefer mission relevance over generic newsworthiness.
- Prefer corroborated story clusters over isolated "clean" headlines.
- Prefer active accountability stories over routine institutional churn.
- Courts matter, but Congress, surveillance, executive abuse, democracy, war, authoritarianism, and corruption must also surface when salient.
- Do not let sports, consumer tech, or entertainment leakage compete with mission items.

## Ranking Philosophy

- Keep scoring deterministic and inspectable.
- Use fewer overlapping boosts.
- Treat trusted creator convergence as a signal.
- Rank story clusters higher than isolated items when corroborated.
- Use source trust, recency, mission fit, and corroboration as the main forces.
- Avoid adding another layer of opaque weights unless absolutely necessary.

## Engineering Rules

- Reuse existing repo patterns.
- Keep code small, explicit, and readable.
- Prefer modifying existing scoring helpers over inventing parallel systems.
- Add tests for ranking behavior whenever changing ranking logic.
- Preserve existing debug / explain metadata where practical.
- Do not remove deterministic explanations unless replacing them with better ones.

## Likely Edit Areas

- `lib/intel/missionScope.ts`
- `lib/intel/displayPriority.ts`
- `lib/intel/rankingProfile.ts`
- `lib/intel/globalPromotion.ts`
- `lib/intel/rank.ts`
- `lib/feeds/homepageBriefing.weights.ts`
- `lib/feeds/homepageBriefing.policy.ts`
- `lib/feeds/homepageBriefing.service.js`
- `lib/feeds/homepageIntel.service.js`
- `tests/homepageBriefing.test.ts`
- `tests/intel/*.test.ts`

## Working Style

- Complete the requested task fully before stopping.
- Do not stop after planning.
- Run targeted tests relevant to the files changed.
- Report concise results and remaining risks.

## Task Guardrails

- Do not change application behavior unless the task explicitly requires it.
- When ranking logic changes, keep explanations deterministic, inspectable, and easy to compare in tests.
- Prefer the smallest edit that keeps mission fit, corroboration, and source trust legible in code.
