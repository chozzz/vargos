/**
 * Channel management — shared CRUD used by onboard wizard and vargos channels CLI.
 *
 * Exports:
 *   listChannels()        → array of { id, type, botToken? }
 *   registerChannel()     → add to config.json
 *   deregisterChannel()   → remove from config.json
 *   pairWhatsApp()        → standalone QR pairing (stops after connected)
 */
import type { ChannelEntry } from '../services/config/schemas/channels.js';
export interface ChannelInfo {
    id: string;
    type: ChannelEntry['type'];
    botToken?: string;
    enabled?: boolean;
    registered?: boolean;
}
export interface RegisterChannelParams {
    id: string;
    type: ChannelEntry['type'];
    botToken?: string;
}
export declare function listChannels(): ChannelInfo[];
export declare function registerChannel(params: RegisterChannelParams): void;
export declare function deregisterChannel(id: string): void;
export declare function pairWhatsApp(id: string): Promise<void>;
//# sourceMappingURL=channels.d.ts.map