# WhatsApp ID Mapping & JID Formats

## Quick Reference: JID Formats

| Format | Example | When | Meaning |
|--------|---------|------|---------|
| **Phone-based** | `+1234567890@s.whatsapp.net` | PC/Web client | Your actual phone number as JID |
| **Linked Device** | `9876543210@lid` | Phone client | Internal device ID assigned by WhatsApp |

Both represent **you** (same WhatsApp account), but from different devices.

### Can They Be Normalized to 1 Identifier?

**Short answer: Not at the protocol level.**

These are fundamentally different identifiers in WhatsApp's system:
- `+1234567890` = your phone number (universal, stable)
- `9876543210` = device token (changes per device/re-auth)

The phone number is more stable, but WhatsApp doesn't include it in all message contexts (especially from `@lid` devices).

## Problem

WhatsApp users can send messages from multiple devices, each with a different JID format:

| Device | JID Format | Example |
|--------|-----------|---------|
| **PC/Web** | `PHONE@s.whatsapp.net` | `+1234567890@s.whatsapp.net` |
| **Phone** | `DEVICE_ID@lid` | `9876543210@lid` |
| **Group** | `DEVICE_ID@lid` or `GROUP_ID@g.us` | `9876543210@lid` |

**Issue**: Whitelist config uses phone numbers (`+1234567890`), but phone messages use device IDs (`9876543210@lid`). These don't match, causing whitelisted users to be rejected.

## Current Flow

```
WhatsApp message arrives
  ↓
adapter.handleInbound(msg)
  ↓
Extract fromUserId = msg.jid
  ↓
Normalize: strip + and @suffix
  ↓
Compare against whitelist (phone numbers)
  ↓
❌ Device ID doesn't match phone number
```

## Solution Options

### Option 1: Store Both Formats in Whitelist (Quick)
Add device ID mappings to config:
```json
{
  "channels": [{
    "id": "whatsapp-vadi-indo",
    "allowFrom": ["+1234567890", "9876543210"]
  }]
}
```
**Pros**: Simple, works now  
**Cons**: Manual mapping, fragile across devices, maintains duplicates

### Option 2: Device ID Registry (Medium)
Store device-to-phone mappings:
```json
{
  "whatsappDeviceMap": {
    "9876543210": "+1234567890",
    "9876543210": "+1234567890"
  }
}
```
**Pros**: Single source of truth  
**Cons**: Manual sync, needs update on new device login

### Option 3: Trust First Contact + Registration (Better)
- First message from new device ID → whitelist it under the account
- Device ID persists per account, no manual config
- Requires user ID validation (OTP, etc.)

**Pros**: Zero-touch, automatic  
**Cons**: More complex, needs trust/approval flow

### Option 4: Extract Phone from Message Context (Best)
- WhatsApp API can provide sender's phone number in message metadata
- Use phone number as primary whitelist key
- Device ID becomes secondary identifier

**Pros**: Universal, matches config  
**Cons**: Requires lib-baileys enhancement or different WA client

## Recommendation

**Implement Option 2 + Option 1 hybrid:**
1. Accept phone numbers in `allowFrom` (current)
2. Add optional `whatsappDeviceMap` for known device IDs
3. Log unmapped device IDs for easy addition to config
4. Plan migration to Option 4 (extract phone from context)

## Test Fixtures

See `__tests__/fixtures/messages.ts` for real-world message shapes covering:
- Private from PC
- Private from phone
- Group message
- Group message from other user
- Group message with mention
