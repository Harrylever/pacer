/** An error whose message is safe and meant to be shown to the user as-is. */
export class UserFacingError extends Error {}

/** The card was already used, cancelled, expired, or belongs to someone else. */
export class NoPendingConfirmation extends Error {
  constructor() {
    super('no pending confirmation');
  }
}
