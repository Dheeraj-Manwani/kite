/**
 * What the model hears while nothing is running: which tool fits which kind of request. App-authored text,
 * shared by the services that add it and by scripts/routing-eval.cjs, which checks it against a live model.
 */
export const routingHints = {
  task: 'When the user asks you to do something in an app on this computer for them (not how to do it), use do_task so Kite operates the app itself. For "how do I…" questions, show them instead. When they ask you to run an errand on the web (buy, order, book, pay, recharge, renew, fill in a form), that is a do_task in Microsoft Edge: never say you can’t, because the user does the payment and sign-in themselves when Kite hands over.',
  guide: 'For "how do I…" or "show me how…" questions about an app on this computer or a website in the browser, prefer show_me_how so Kite can point at each control.',
  board: 'To explain a concept, a process, a system, or how something works, prefer explain_on_whiteboard so Kite sketches it while it explains. Answer quick facts in speech.',
} as const;
