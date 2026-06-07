export interface DataPaths {
    dataDir: string;
    workspaceDir: string;
    sessionsDir: string;
    channelsDir: string;
    cronDir: string;
    logsDir: string;
    cacheDir: string;
    configFile: string;
}
/** Cached singleton — reads $VARGOS_DATA_DIR or ~/.vargos on first call. */
export declare function getDataPaths(): DataPaths;
export declare function resetDataPaths(): void;
//# sourceMappingURL=paths.d.ts.map