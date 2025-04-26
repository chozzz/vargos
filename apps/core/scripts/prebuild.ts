import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, accessSync, constants } from 'fs';

// Create logger wrapper
const logger = {
  log: (...args: any[]) => console.log('\x1b[0m[Prebuild]', ...args),
  warn: (...args: any[]) => console.warn('\x1b[33m[Prebuild]', ...args),
  error: (...args: any[]) => console.error('\x1b[31m[Prebuild]', ...args),
  info: (...args: any[]) => console.info('\x1b[36m[Prebuild]', ...args),
};

const home = homedir();
const vargosDir = join(home, '.vargos');
const dataDir = process.env.DATA_DIR || join(vargosDir, 'data');
const functionsDir = process.env.FUNCTIONS_DIR || join(vargosDir, 'functions');

// Create base .vargos directory if it doesn't exist
if (!existsSync(vargosDir)) {
  mkdirSync(vargosDir);
}

// Check and create data directory
if (!existsSync(dataDir)) {
  mkdirSync(dataDir);
  logger.log(`Created data directory at: ${dataDir}`);
} else {
  logger.log(`Data directory exists at: ${dataDir}`);
}

// Check and create functions directory  
if (!existsSync(functionsDir)) {
  mkdirSync(functionsDir);
  logger.log(`Created functions directory at: ${functionsDir}`);
} else {
  logger.log(`Functions directory exists at: ${functionsDir}`);
}

// Check directory permissions
const checkPermissions = (dir: string) => {
  try {
    accessSync(dir, constants.R_OK);
    process.env[`${dir}_READ`] = 'true';
    logger.info(`Read permission granted for ${dir}`);
  } catch {
    process.env[`${dir}_READ`] = 'false';
    logger.warn(`No read permission for ${dir}`);
  }

  try {
    accessSync(dir, constants.W_OK);
    process.env[`${dir}_WRITE`] = 'true';
    logger.info(`Write permission granted for ${dir}`);
  } catch {
    process.env[`${dir}_WRITE`] = 'false'; 
    logger.warn(`No write permission for ${dir}`);
  }

  try {
    accessSync(dir, constants.X_OK);
    process.env[`${dir}_EXECUTE`] = 'true';
    logger.info(`Execute permission granted for ${dir}`);
  } catch {
    process.env[`${dir}_EXECUTE`] = 'false';
    logger.warn(`No execute permission for ${dir}`);
  }
};

checkPermissions(dataDir);
checkPermissions(functionsDir);

// Wait 5s
setTimeout(() => {
  logger.log('Prebuild completed successfully');
}, 5000);
