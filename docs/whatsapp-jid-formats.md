# WhatsApp JID Formats & User Identification

## The Two Formats (Your Case)

| Format | Example | When | Meaning |
|--------|---------|------|---------|
| **Phone-based** | `61423222658@s.whatsapp.net` | PC/Web client | Your actual phone number as JID |
| **Linked Device** | `210994982838335@lid` | Phone client | Internal device ID assigned by WhatsApp |

Both represent **you** (same WhatsApp account), but from different devices.

## Can They Be Normalized to 1 Identifier?

**Short answer: Not at the protocol level.**

These are fundamentally different identifiers in WhatsApp's system:
- `61423222658` = your phone number (universal, stable)
- `210994982838335` = device token (changes per device/re-auth)

**The phone number is more stable**, but WhatsApp doesn't include it in all message contexts (especially from `@lid` devices).

## Proposed Solution for Config

Instead of trying to normalize to one, **accept both formats in allowFrom**:

```json
{
  "channels": [{
    "id": "whatsapp-vadi-indo",
    "allowFrom": [
      "61423222658@s.whatsapp.net",    // You from PC/Web
      "210994982838335@lid",            // You from phone
      "+61423222658"                     // Alternative: phone number only
    ]
  }]
}
```

**Adapter logic:**
1. Extract JID from message: `msg.jid`
2. Check against whitelist **as-is** (full JID match)
3. Normalize both config + incoming for fallback match

## Implementation Path

### Phase 1: Full JID Matching (E2E Test)
- Update `allowFrom` to accept full JIDs
- Whitelist check: exact JID match first
- Log both formats when message arrives

### Phase 2: Smarter Matching
- Normalize: `NUMERIC_ID@[s.whatsapp.net|lid|g.us]` → `NUMERIC_ID`
- Whitelist can have either full JID or numeric ID
- Support both: `61423222658@s.whatsapp.net` and `61423222658`

### Phase 3: Device Linking (Future)
- Create `deviceMap` to group equivalent JIDs
- One whitelist entry maps to multiple devices
- Requires user authentication/registration flow

## Why Not Auto-Map?

We can't automatically know that `61423222658` (phone) and `210994982838335` (device) are the same person without:
1. WhatsApp's internal user ID (not exposed to lib-baileys)
2. User registration/linking in config
3. First-message trust + approval

This is why support typically requires manual setup.
