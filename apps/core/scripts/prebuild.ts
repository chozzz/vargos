import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, accessSync, constants, copyFileSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

// Logger with colors
const logger = {
  log: (...args: any[]) => console.log('\x1b[0m[Prebuild]', ...args),
  warn: (...args: any[]) => console.warn('\x1b[33m[Prebuild]', ...args),
  error: (...args: any[]) => console.error('\x1b[31m[Prebuild]', ...args),
  info: (...args: any[]) => console.info('\x1b[36m[Prebuild]', ...args),
};

// Constants
const HOME = homedir();
const VARGOS_DIR = join(HOME, '.vargos');
const ROOT_DIR = process.cwd();
const ENV_FILE = join(ROOT_DIR, '.env');
const ENV_EXAMPLE_FILE = join(ROOT_DIR, '.env.example');

// Initialize directories
const initializeDirectories = () => {
  // Create .vargos directory if it doesn't exist
  if (!existsSync(VARGOS_DIR)) {
    mkdirSync(VARGOS_DIR);
    logger.log(`Created .vargos directory at: ${VARGOS_DIR}`);
  }

  // Set default directories
  const dataDir = process.env.DATA_DIR || join(VARGOS_DIR, 'data');
  const functionsDir = process.env.FUNCTIONS_DIR || join(VARGOS_DIR, 'functions');

  // Create data directory
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir);
    logger.log(`Created data directory at: ${dataDir}`);
  }

  // Create functions directory and initialize template
  if (!existsSync(functionsDir)) {
    mkdirSync(functionsDir);
    logger.info(`Functions directory does not exist at: ${functionsDir}`);
    logger.info('Will clone template from official Vargos functions repository...');
    
    // Clone template repository
    logger.log('Cloning functions template from https://github.com/chozzz/vargos-functions-template...');
    execSync(`git clone git@github.com:chozzz/vargos-functions-template.git ${functionsDir}`);
    logger.info('Successfully cloned functions template');
    
    // Install dependencies
    logger.log('Installing dependencies for functions template...');
    execSync('./setup.sh', { cwd: functionsDir });
    logger.info('Successfully installed dependencies');
  }

  return { dataDir, functionsDir };
};

// Update environment variable in .env file
const updateEnvVariable = (key: string, value: string) => {
  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, `${key}=${value}\n`);
    return;
  }

  const envContent = readFileSync(ENV_FILE, 'utf-8') || '';
  const lines = envContent.split('\n');
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.startsWith(`${key}=`)) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`${key}=${value}`);
  }

  writeFileSync(ENV_FILE, lines.join('\n'));
};

// Handle environment file
const setupEnvironmentFile = () => {
  if (!existsSync(ENV_FILE)) {
    if (existsSync(ENV_EXAMPLE_FILE)) {
      // Copy from example if it exists
      copyFileSync(ENV_EXAMPLE_FILE, ENV_FILE);
      logger.log('Created .env file from .env.example');
    } else {
      // Create new .env file with default values
      const defaultEnv = `# Vargos Environment Configuration
DATA_DIR=${join(VARGOS_DIR, 'data')}
FUNCTIONS_DIR=${join(VARGOS_DIR, 'functions')}
`;
      writeFileSync(ENV_FILE, defaultEnv);
      logger.log('Created new .env file with default values');
    }
  }
};

// Check directory permissions
const checkPermissions = (dir: string) => {
  const permissions = {
    read: false,
    write: false,
    execute: false,
  };

  try {
    accessSync(dir, constants.R_OK);
    permissions.read = true;
    logger.info(`Read permission granted for ${dir}`);
  } catch {
    logger.warn(`No read permission for ${dir}`);
  }

  try {
    accessSync(dir, constants.W_OK);
    permissions.write = true;
    logger.info(`Write permission granted for ${dir}`);
  } catch {
    logger.warn(`No write permission for ${dir}`);
  }

  try {
    accessSync(dir, constants.X_OK);
    permissions.execute = true;
    logger.info(`Execute permission granted for ${dir}`);
  } catch {
    logger.warn(`No execute permission for ${dir}`);
  }

  return permissions;
};

// Main execution
const main = async () => {
  try {
    // Setup environment file
    setupEnvironmentFile();

    // Initialize directories
    const { dataDir, functionsDir } = initializeDirectories();

    // Check permissions
    const dataPermissions = checkPermissions(dataDir);
    const functionsPermissions = checkPermissions(functionsDir);

    // Update environment variables if using defaults
    if (!process.env.DATA_DIR) {
      updateEnvVariable('DATA_DIR', dataDir);
      logger.log('Updated DATA_DIR in .env file');
    }
    if (!process.env.FUNCTIONS_DIR) {
      updateEnvVariable('FUNCTIONS_DIR', functionsDir);
      logger.log('Updated FUNCTIONS_DIR in .env file');
    }

    logger.log('Prebuild completed successfully');
  } catch (error) {
    logger.error('Prebuild failed:', error);
    process.exit(1);
  }
};

// Run the script
main();
