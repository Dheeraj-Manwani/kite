# Repeat orders take one question, and Kite learns when to stop asking

Status: Accepted, 2 October 2026. Builds on ADR 014 (permissions), ADR 015 (memory) and ADR 016 (checkout).

## Context

A first order takes two questions: who checks out, and Place order (ADR 016). For something bought every month that's still too many: the goal in docs/end-to-end-jobs.md §2 is "Order my protein again" → one question → payment. Separately, a user who says yes to the same kind of step on the same site again and again should be offered a rule, once, rather than finding it in Settings.

## Decision

- **Order history** is one readable memory line per confirmed order: items, total, site, payment method, order number, delivery date (`orderValue` / `parseOrder` in `src/shared/orders.ts`).
- **`reorder`, a chat tool, is the one question.** For "again", "the usual" or "same as last time", it finds the remembered order (`findOrder`). Its approval card, written by code, says: "Same as last time: …, about ₹2,149, from shop.example.in, to your Home address? I'll check out like last time, paying by Cash on delivery, and ask again only if the cart or the price has changed." If Spend money is Don't allow on that site, the card says Kite will stop at the cart instead. With no matching order, nothing happens, and the model is told to start a new errand.
- **The yes is a pre-approval, bounded by code.** The job is planned by code from the order, with no planner call.
  - The checkout question is skipped only if the cart read from the page holds exactly the order's items.
  - The Place order card is skipped only if the order total read from the page is within `repeatTolerance`: 10% above the confirmed amount, or ₹50 for small orders.
  - Otherwise each asks as usual, and says why: "That's ₹2,799; you said yes to about ₹2,149."
- **The price check** applies to every order: a total above 1.5× the last order of the same items asks at Place order, in every mode, including Hands-off within the spend limit.
- **"Stop asking?"** After the third plain yes to a step whose kind is set to Ask (and where "Always" would have helped), Kite offers once: "That's 3 times you've said yes to "Submit" on this site. Stop asking about those there?" Yes saves a site rule; no is remembered, and the offer never comes back for that pair. The counts are Kite's bookkeeping, kept beside the preferences, not a setting.

## Consequences

- A repeat order on Kite Test Mart takes exactly one question (the card), then the payment, if any. This is tested end to end through the real broker, tool session and task session.
- The spend limit's floor (ADR 014) is satisfied for a repeat by the user's yes to an amount written by code, not by the limit. That yes covers only that order, that cart and that price band.
- Order lines are read back by pattern. Orders saved in phase 4, without a payment method, still read; they just don't name the payment.
- Matching a phrase to an order is by shared words. "The usual" with several kinds of past orders picks the newest, and the card shows which, so a wrong match is seen before anything happens.
