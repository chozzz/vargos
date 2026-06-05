/**
 * Local document text extraction — PDF, DOCX, XLSX, TXT, MD
 * No external API calls, pure Node.js library-based extraction
 */
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';
import XLSX from 'xlsx';
import { createLogger } from '../../../lib/logger.js';
import { toMessage } from '../../../lib/error.js';
import { getDataPaths } from '../../../lib/paths.js';
const log = createLogger('media');
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_TEXT_SIZE = 1 * 1024 * 1024; // 1 MB for text files (token cost)
/**
 * Validate and resolve document path to prevent traversal attacks
 */
async function validatePath(filePath) {
    const dataDir = getDataPaths().dataDir;
    const resolved = path.resolve(filePath);
    const rel = path.relative(dataDir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path outside workspace: ${filePath}`);
    }
    const fileStats = await lstat(resolved);
    if (fileStats.isSymbolicLink()) {
        throw new Error(`Symlinks not allowed: ${filePath}`);
    }
    if (!fileStats.isFile()) {
        throw new Error(`Not a regular file: ${filePath}`);
    }
    const ext = path.extname(resolved).toLowerCase();
    const maxSize = ext === '.txt' || ext === '.md' ? MAX_TEXT_SIZE : MAX_DOCUMENT_SIZE;
    if (fileStats.size > maxSize) {
        throw new Error(`Document too large: ${fileStats.size} bytes (max ${maxSize})`);
    }
    return resolved;
}
export async function extractDocument(filePath, mimeType) {
    try {
        const validatedPath = await validatePath(filePath);
        const ext = path.extname(validatedPath).toLowerCase();
        const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
        // Plain text formats
        if (normalizedMime === 'text/plain' || normalizedMime === 'text/markdown' || ext === '.txt' || ext === '.md') {
            const text = await readFile(validatedPath, 'utf-8').then(t => t.replace(/^\uFEFF/, ''));
            return { text };
        }
        // PDF extraction
        if (normalizedMime === 'application/pdf' || ext === '.pdf') {
            const buffer = await readFile(validatedPath);
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
            return { text: result.text };
        }
        // DOCX extraction
        if (normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
            const result = await mammoth.extractRawText({ path: validatedPath });
            return { text: result.value };
        }
        // XLSX extraction
        if (normalizedMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === '.xlsx') {
            const buffer = await readFile(validatedPath);
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheets = workbook.SheetNames;
            const texts = [];
            for (const sheet of sheets) {
                texts.push(`## Sheet: ${sheet}\n`);
                const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]);
                texts.push(csv);
            }
            return { text: texts.join('\n') };
        }
        // Fallback: try to read as text
        const text = await readFile(validatedPath, 'utf-8');
        return { text };
    }
    catch (err) {
        const errorMsg = toMessage(err);
        log.error(`Document extraction failed for ${filePath}: ${errorMsg}`);
        throw new Error(`Failed to extract document: ${errorMsg}`, { cause: err });
    }
}
//# sourceMappingURL=document.js.map