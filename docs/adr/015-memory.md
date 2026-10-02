# Memory keeps personal values away from models

Status: Accepted, 1 October 2026.

## Context

Jobs ask for the same things every time: pincode, address, phone. Remembering them makes a repeat order take one question. But the cheap models used for jobs are run by providers in China (DeepSeek, Moonshot), and a home address shouldn't be sent to any provider just so a model can retype it. Models also mistype long values.

## Options

- Save facts and put them in the prompt as text.
- Save facts and let the model ask for each value through a tool (it still sees the value).
- Save facts, show the model only labels and masks, let it type placeholders that Kite fills in, and replace saved values in everything sent to a model.

## Decision

The third option.

- **Storage.** A `memory` table: kind, key, label, value, source, created, updated, last used. Each value is encrypted with `safeStorage`, as API keys are. `secure_delete` is on.
- **Never saved,** checked by code before anything is stored: passwords, card and bank numbers, CVVs, one-time codes, UPI PINs, Aadhaar and PAN numbers (by the words around them, and by shape: a run of 11 or more digits that isn't a phone number).
- **Placeholders.** Profile and address values are *sensitive*. The model sees `{{home.pincode}}: Home pincode (saved)` or `{{profile.phone}}: phone number (ending 10)`. It types the placeholder, and Kite fills in the value when the step runs. The card says "Type your saved Home pincode", in words written by code. A city and preferences are sent as text.
- **Redaction.** Before a task step goes to the model, saved sensitive values in the controls, the page address, the window title, the goal and the step history are replaced by their placeholders. Chat messages, including earlier turns, get the same treatment. Phone numbers are matched with spaces, dashes and +91. Values stay redacted even while memory is switched off.
- **Saving is visible.** Answers to Kite's questions during a task (pincode, phone, email, name, address), choices in store jobs, and "remember…" in chat save automatically, each with a "Saved … · Undo · Edit" notice by the kite. Nothing is saved silently.
- **Chat tools.** `remember` and `recall` run without an approval card. `forget` asks first. `recall` shows sensitive values to the user on the overlay, and gives the model only labels and masks.
- **The Memory view,** beside History: every fact with where it came from, plus Show, Edit, Forget, Forget everything, Export, and a master switch.

## Consequences

- The exit test renders every prompt of a scripted checkout exactly as the model receives it and finds no saved value. In live runs on Kite Test Mart, `deepseek-flash` filled the pincode prompt by typing `{{home.pincode}}`, and no prompt carried a saved value.
- A value Kite doesn't know is the user's yet (a phone number on a page before they say it) is not redacted.
- Redaction matches exact and near-exact text only: an address split across fields, or abbreviated, can still reach a model in pieces.
- Screenshots, when a vision model asks to look, can show saved values on screen. The Memory view says so.
- Deleting a fact doesn't change old conversations in History; the Memory view says so.
- After a fact is deleted it is no longer redacted, since Kite no longer knows the value.
- Addresses are saved as one line plus a pincode under "home". A second address doesn't ask for a label yet, and store forms that split an address into fields need phase 4's structured address.
