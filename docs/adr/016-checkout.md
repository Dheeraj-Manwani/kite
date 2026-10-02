# Kite checks out, and the person pays

Status: Accepted, 2 October 2026. Builds on ADR 014 (permissions) and ADR 015 (memory).

## Context

Phases 1 to 3 stop at the cart. Finishing the errand means checkout: sign-in, an address, a delivery option, a payment method, Place order, then paying. In India, paying by card needs an OTP and UPI needs a PIN on the phone. Both are deliberately the person's steps. Under ADR 014's Balanced mode, every checkout button is Spend money, so checkout would ask five times, which is slower than doing it yourself. Not asking at all would let a page's "Continue" become a payment nobody approved.

## Options

- Keep stopping at the cart.
- Ask at every money step.
- Ask once who checks out. Then let checkout's steps run, but confirm the one step that places the order, with facts read by code, and wait for the person to pay.

## Decision

The third option.

- **Who checks out** is the Spend money setting for the site, decided at the end of the cart phase:
  - Don't allow: Kite hands over, with the cart read back.
  - Allow, or Hands-off for this job: Kite checks out and says so.
  - Ask: Kite asks "Do you want to check out yourself, or should I?", with "I'll do it", "You do it" and "Remember for this site". Remembering saves a site rule (Allow or Don't allow).
- **"You do it"** covers checkout's money steps (Proceed to checkout, the address, delivery and payment pages) for this job only. Checkout gets its own phase with a budget of 20 steps, and the job's step cap grows to cover it.
- **The order step is always confirmed.** A button that places the order or pays (Place order, Pay ₹…, Confirm order, Buy now) gets a card with the total, address, payment method and delivery read from the page by code. The card is skipped only when Spend money resolves to Allow (Hands-off, Hands-off for this job, a site rule, or a Custom table) and the total read from the page is within the spend limit. With the default limit of ₹0, every order shows the card. The address is shown on the card and never spoken, because speech goes to the voice provider.
- **Secrets stay the person's:** Kite never types passwords, card numbers, CVVs, one-time codes or PINs (ADR 014). The agent asks the person to type them and say continue.
- **The payment handoff is a state, not a failure.** After the order button, Kite reads the page:
  - An order confirmation with an order number ends the job: "Ordered. Order number …, arriving …".
  - A page waiting for payment ("approve the request in your UPI app", "enter the OTP") puts the card in **Your turn**. Kite looks at the page every 2 seconds without calling the model, until the order is confirmed. "I've paid" makes it look at once. Mouse and keyboard use don't count as taking over.
  - After 10 minutes, Kite says it couldn't confirm the order. It never claims an order it didn't see.
- **Order history:** a confirmed order is saved to memory (items, total, site, order number, delivery date), with a notice. Phase 5 repeats orders from it.

## Consequences

- An order on Kite Test Mart takes two questions: who checks out, and Place order. A site rule of Allow removes the first.
- "Place order" is recognised by its label. A store whose final button says only "Continue" gets no order card. But money still can't move without the person: card and UPI payments need their OTP or PIN. Cash on delivery and wallets don't, so the agent is told that Kite confirms the final button, and the checkout corpus test keeps every payment-page "Continue" as Spend money outside a granted checkout.
- The order confirmation is read by keywords and an order-number shape. A store that words it differently ends with "I couldn't confirm the order went through", which is safe but wrong.
- A real order, supervised and paid cash on delivery, is still to do. Automated tests only ever order from the fake shop.
