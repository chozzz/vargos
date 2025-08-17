#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Fixes import paths in ES module files to use .mjs extensions
 */
function fixImportPaths(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace relative imports: from "./something" or from "../something" 
  // with from "./something.mjs" or from "../something.mjs"
  // But only if they don't already have an extension
  content = content.replace(
    /from\s+["'](\.\.?\/[^"']+)(?<!\.mjs)(?<!\.js)(?<!\.json)["']/g,
    (match, importPath) => {
      // Don't modify if it's a directory import (ends with /)
      if (importPath.endsWith('/')) {
        return match;
      }
      return `from "${importPath}.mjs"`;
    }
  );
  
  // Also handle import() statements
  content = content.replace(
    /import\s*\(\s*["'](\.\.?\/[^"']+)(?<!\.mjs)(?<!\.js)(?<!\.json)["']\s*\)/g,
    (match, importPath) => {
      if (importPath.endsWith('/')) {
        return match;
      }
      return `import("${importPath}.mjs")`;
    }
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Recursively copies all .js files from dist-esm to .mjs files in the dist directory
 * and fixes import paths to use .mjs extensions
 */
function copyEsmToMjs(esmDir, distDir) {
  const entries = fs.readdirSync(esmDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const esmPath = path.join(esmDir, entry.name);
    const distPath = path.join(distDir, entry.name);
    
    if (entry.isDirectory()) {
      // Create directory if it doesn't exist
      if (!fs.existsSync(distPath)) {
        fs.mkdirSync(distPath, { recursive: true });
      }
      copyEsmToMjs(esmPath, distPath);
    } else if (entry.name.endsWith('.js')) {
      const mjsPath = distPath.replace(/\.js$/, '.mjs');
      fs.copyFileSync(esmPath, mjsPath);
      // Fix import paths in the copied file
      fixImportPaths(mjsPath);
      console.log(`Created: ${mjsPath}`);
    }
  }
}

// First, compile TypeScript to ES modules
console.log('📦 Compiling TypeScript to ES modules...');
try {
  execSync('tsc -p tsconfig.esm.json', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (error) {
  console.error('❌ Failed to compile TypeScript to ES modules');
  process.exit(1);
}

// Then copy ES module files to .mjs in dist
const distEsmDir = path.join(__dirname, '..', 'dist-esm');
const distDir = path.join(__dirname, '..', 'dist');

if (fs.existsSync(distEsmDir)) {
  copyEsmToMjs(distEsmDir, distDir);
  
  // Clean up dist-esm directory
  fs.rmSync(distEsmDir, { recursive: true, force: true });
  
  console.log('✅ Successfully generated .mjs files');
} else {
  console.error('❌ dist-esm directory not found after compilation');
  process.exit(1);
}

