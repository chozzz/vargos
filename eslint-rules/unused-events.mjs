import fs from 'fs';
import path from 'path';

/**
 * Custom ESLint rule: no-unused-events
 *
 * Validates that every event in gateway/events.ts EventMap is either:
 * - Emitted via bus.emit('eventName', ...)
 * - Registered via @register('eventName', ...)
 *
 * Prevents accumulation of dead event definitions.
 */

export const noUnusedEventsRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure all EventMap events are emitted or registered',
      category: 'Best Practices',
      recommended: 'error',
    },
  },
  create(context) {
    // Only run this rule on the events.ts file
    const filename = context.filename;
    if (!filename.endsWith('gateway/events.ts')) {
      return {};
    }

    return {
      TSInterfaceDeclaration(node) {
        if (node.id.name !== 'EventMap') {
          return;
        }

        // Extract all event names from the EventMap interface
        const eventNames = new Set();
        if (node.body && node.body.body) {
          for (const member of node.body.body) {
            if (member.key && member.key.value) {
              eventNames.add(member.key.value);
            }
          }
        }

        // For each event, check if it's used in the codebase
        const codeDir = path.dirname(path.dirname(filename)); // gateway -> root
        const unused = [];

        for (const eventName of eventNames) {
          if (isEventUsed(eventName, codeDir)) {
            continue;
          }
          unused.push(eventName);
        }

        if (unused.length > 0) {
          context.report({
            node,
            message: `EventMap contains unused events: ${unused.join(', ')}. Remove or use them via bus.emit() or @register().`,
          });
        }
      },
    };
  },
};

/**
 * Check if an event is used anywhere in the codebase.
 * Returns true if found in bus.emit, bus.call, @register, or @on.
 */
function isEventUsed(eventName, codeDir) {
  // Escape special regex chars in event name
  const escaped = eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match multiple patterns:
  // - bus.emit('eventName' or bus.emit("eventName"
  // - bus.call('eventName' or bus.call("eventName"
  // - @register('eventName' or @register("eventName"
  // - @on('eventName' or @on("eventName"
  // - EventMap['eventName' (for type checking in comments)
  const patterns = [
    new RegExp(`\\bbus\\.emit\\s*\\(\\s*['"\`]${escaped}`, ''),
    new RegExp(`\\bbus\\.call\\s*\\(\\s*['"\`]${escaped}`, ''),
    new RegExp(`@register\\s*\\(\\s*['"\`]${escaped}`, ''),
    new RegExp(`@on\\s*\\(\\s*['"\`]${escaped}`, ''),
  ];

  const filesToCheck = getAllTypeScriptFiles(codeDir);

  for (const file of filesToCheck) {
    // Skip events.ts itself
    if (file.endsWith('events.ts')) continue;

    try {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          return true;
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return false;
}

/**
 * Recursively find all .ts files in the codebase.
 */
function getAllTypeScriptFiles(codeDir, files = []) {
  try {
    const entries = fs.readdirSync(codeDir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip common exclusions
      if (['node_modules', 'dist', '.git', 'out'].includes(entry.name)) {
        continue;
      }

      const fullPath = path.join(codeDir, entry.name);

      if (entry.isDirectory()) {
        getAllTypeScriptFiles(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}
