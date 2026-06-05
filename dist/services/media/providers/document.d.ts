/**
 * Local document text extraction — PDF, DOCX, XLSX, TXT, MD
 * No external API calls, pure Node.js library-based extraction
 */
export declare function extractDocument(filePath: string, mimeType: string): Promise<{
    text: string;
}>;
//# sourceMappingURL=document.d.ts.map