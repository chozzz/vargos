/**
 * Status reaction controller
 * Maps agent phases to emoji reactions on the triggering message.
 * Debounces transient states (thinking, tool) and seals on terminal ones (done, error).
 */
const EMOJI = {
    queued: '👀',
    thinking: '🤔',
    tool: '🔧',
    done: '👍',
    error: '❗',
};
const DEBOUNCE_MS = 500;
export class StatusReactionController {
    adapter;
    recipientId;
    messageId;
    sealed = false;
    debounceTimer = null;
    chain = Promise.resolve();
    constructor(adapter, recipientId, messageId) {
        this.adapter = adapter;
        this.recipientId = recipientId;
        this.messageId = messageId;
    }
    setThinking() { this.debounced('thinking'); }
    setTool() { this.debounced('tool'); }
    setDone() { this.immediate('done'); }
    setError() { this.immediate('error'); }
    dispose() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
    debounced(phase) {
        if (this.sealed)
            return;
        if (this.debounceTimer)
            clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.enqueue(phase);
        }, DEBOUNCE_MS);
    }
    immediate(phase) {
        if (this.sealed)
            return;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (phase === 'done' || phase === 'error')
            this.sealed = true;
        this.enqueue(phase);
    }
    enqueue(phase) {
        const emoji = EMOJI[phase];
        this.chain = this.chain.then(() => this.adapter.react(this.recipientId, this.messageId, emoji)
            .catch(() => { }));
    }
}
//# sourceMappingURL=status-reactions.js.map