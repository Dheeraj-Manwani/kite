export const mailErrors = {
  setup: 'Import a Google Desktop OAuth client in Mail accounts before connecting Gmail.',
  access: 'Gmail access is unavailable. Reconnect this same account, then review and resume the run.',
  account: 'The signed-in mailbox does not match this account. Reconnect using the expected Gmail account.',
  scope: 'Gmail must grant only read-only mail access. Remove any previous broader grant for this OAuth client in Google, then reconnect.',
  cancelled: 'Gmail connection was cancelled or expired. You can connect again.',
  network: 'Gmail could not be reached. Check your connection and retry. No mail was changed.',
  rate: 'Gmail is rate limited. Wait before reviewing and resuming this run.',
  provider: 'Gmail rejected the request. Check that the Gmail API, consent screen and test-user access are configured.',
  limits: 'A mail response or attachment exceeds this release’s size or format limits.',
  invalid: 'Gmail returned an unsupported or incomplete response.',
} as const;
export class MailFailure extends Error { constructor(readonly code: keyof typeof mailErrors) { super(mailErrors[code]); this.name = 'MailFailure'; } }
