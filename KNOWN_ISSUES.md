# Known Issues

## Transcription Failures Silent

**Status:** Open

**Affected:** WhatsApp/Telegram voice messages

### Symptoms

If Whisper API fails, the audio file path is sent to the agent without notifying the user.

### Workaround

Logs a warning. Agent receives `[Voice message saved: /path]` instead of transcribed text.

### Fix

Send error message to user: "Transcription failed, sending audio file instead."

## No Image Size Limits

**Status:** Open

**Affected:** Channel messages with large images

### Symptoms

Large images sent to PiAgent without size checking. Model may reject oversized images.

### Workaround

PiAgent/model may reject oversized images gracefully.

### Fix

Add image resize/compression before sending to agent.

## No Media Type Validation

**Status:** Open

**Affected:** Channel adapters

### Symptoms

Channels accept any image/audio format, but Whisper only supports specific audio formats.

### Workaround

`transcribeAudio()` auto-corrects file extensions.

### Fix

Add format validation in channel adapters.

## No Concurrent Request Limits

**Status:** Open

**Affected:** Multi-user channel sessions

### Symptoms

Multiple users can trigger `agent.execute` simultaneously on the same session.

### Workaround

PiAgent handles concurrency internally.

### Fix

Add per-session queue if needed.
