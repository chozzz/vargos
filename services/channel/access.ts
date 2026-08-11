/**
 * Channel access policy — pure predicates over config and message shape.
 * No platform knowledge and no I/O: adapters transport, the pipeline decides.
 */

/**
 * Whether a sender may talk to the agent at all.
 * `undefined` allowFrom means unconfigured (allow all); `[]` means an explicit empty
 * whitelist (block all). Entries match either the full id or its bare user portion,
 * so `+6142…`, `6142…@s.whatsapp.net` and `6142…` are all the same person.
 */
export function isAllowed(allowFrom: string[] | undefined, userId: string): boolean {
  if (allowFrom === undefined) return true;

  const withoutPlus = userId.replace(/^\+/, '');
  const bareUser = withoutPlus.replace(/@[^@]+$/, '');

  return allowFrom.some((entry) => {
    const normalized = entry.replace(/^\+/, '');
    return withoutPlus === normalized || bareUser === normalized;
  });
}

/**
 * Whether an inbound message should start an agent run.
 * Private chats need only the whitelist; groups additionally need an @mention, so a
 * whitelisted user can talk in a group without summoning the bot on every line.
 */
export function shouldExecute(
  allowFrom: string[] | undefined,
  userId: string,
  chatType: string,
  isMentioned: boolean,
): boolean {
  if (!isAllowed(allowFrom, userId)) return false;
  if (chatType === 'private') return true;
  return isMentioned;
}
