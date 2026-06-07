let _bus = null;
/** Called once by LogService.boot() to wire the global logger to the bus. */
export function setLoggerBus(bus) {
    _bus = bus;
}
export function ts() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`;
}
export function createLogger(service) {
    function write(level, message, data) {
        if (_bus) {
            _bus.emit('log.onLog', { level, service, message, ...(data !== undefined ? { data } : {}) });
        }
        else {
            console.error(`${ts()} [${service}] ${level.toUpperCase()} ${message}`, data ?? '');
        }
    }
    return {
        debug: (msg, data) => write('debug', msg, data),
        info: (msg, data) => write('info', msg, data),
        warn: (msg, data) => write('warn', msg, data),
        error: (msg, data) => write('error', msg, data),
    };
}
//# sourceMappingURL=logger.js.map