import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

export function ToolCalls({
  toolCalls,
}: {
  toolCalls: AIMessage["tool_calls"];
}) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

  if (!toolCalls || toolCalls.length === 0) return null;

  const toggleExpanded = (idx: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const formatArgsPreview = (args: Record<string, any>): string => {
    const entries = Object.entries(args);
    if (entries.length === 0) return "{}";
    
    const preview = entries
      .slice(0, 2)
      .map(([key, value]) => {
        const valueStr = isComplexValue(value)
          ? JSON.stringify(value).slice(0, 30) + "..."
          : String(value).slice(0, 30);
        return `${key}: ${valueStr}`;
      })
      .join(", ");
    
    return entries.length > 2 ? `${preview}, ...` : preview;
  };

  return (
    <div className="space-y-2 w-full max-w-4xl" data-testid="tool-calls-container">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const hasArgs = Object.keys(args).length > 0;
        const isExpanded = expandedIndices.has(idx);
        
        return (
          <div
            key={idx}
            className="border border-gray-200 rounded-lg overflow-hidden"
            data-testid={`tool-call-${idx}`}
          >
            <motion.div
              className="bg-gray-50 px-4 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => toggleExpanded(idx)}
              data-testid={`tool-call-${idx}-header`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h6 className="font-medium text-sm text-gray-900 flex-shrink-0" data-testid={`tool-call-${idx}-name`}>
                  {tc.name}
                </h6>
                {tc.id && (
                  <code className="text-xs bg-gray-100 px-2 py-0.5 rounded flex-shrink-0" data-testid={`tool-call-${idx}-id`}>
                    {tc.id}
                  </code>
                )}
                {hasArgs && !isExpanded && (
                  <span className="text-sm text-gray-500 truncate" data-testid={`tool-call-${idx}-preview`}>
                    ({formatArgsPreview(args)})
                  </span>
                )}
              </div>
              {hasArgs && (
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(idx);
                  }}
                  className="flex-shrink-0 text-gray-500 hover:text-gray-700 transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  data-testid={`tool-call-${idx}-toggle`}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Collapse tool call" : "Expand tool call"}
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </motion.button>
              )}
            </motion.div>
            
            <AnimatePresence>
              {hasArgs && isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                  data-testid={`tool-call-${idx}-content`}
                >
                  <table className="min-w-full divide-y divide-gray-200 bg-white" data-testid={`tool-call-${idx}-table`}>
                    <tbody className="divide-y divide-gray-200">
                      {Object.entries(args).map(([key, value], argIdx) => (
                        <tr key={argIdx} data-testid={`tool-call-${idx}-arg-${argIdx}`}>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900 whitespace-nowrap" data-testid={`tool-call-${idx}-arg-${argIdx}-key`}>
                            {key}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500" data-testid={`tool-call-${idx}-arg-${argIdx}-value`}>
                            {isComplexValue(value) ? (
                              <code className="bg-gray-50 rounded px-2 py-1 font-mono text-sm break-all">
                                {JSON.stringify(value, null, 2)}
                              </code>
                            ) : (
                              String(value)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export function ToolResult({ message }: { message: ToolMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);

  let parsedContent: any;
  let isJsonContent = false;

  try {
    if (typeof message.content === "string" ) {
      parsedContent = JSON.parse(message.content);
      isJsonContent = true;
    }
  } catch {
    // Content is not JSON, use as is
    parsedContent = message.content;
  }

  // Check if parsed content is a primitive (string, number, boolean, null)
  const isPrimitive = isJsonContent && (
    typeof parsedContent === 'string' ||
    typeof parsedContent === 'number' ||
    typeof parsedContent === 'boolean' ||
    parsedContent === null
  );

  const contentStr = isJsonContent
    ? JSON.stringify(parsedContent, null, 2)
    : String(message.content);
  const contentLines = contentStr.split("\n");
  
  // Generate preview for collapsed state
  const getPreview = (): string => {
    if (isPrimitive) {
      const str = String(parsedContent);
      return str.length > 60 ? str.slice(0, 60) + "..." : str;
    }
    if (isJsonContent) {
      if (Array.isArray(parsedContent)) {
        return `[${parsedContent.length} items]`;
      }
      if (typeof parsedContent === 'object' && parsedContent !== null) {
        const keys = Object.keys(parsedContent);
        return `{${keys.length} ${keys.length === 1 ? 'key' : 'keys'}}`;
      }
    }
    // For non-JSON content, show first line or truncated
    const firstLine = contentLines[0] || "";
    return firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine;
  };

  const preview = getPreview();

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" data-testid="tool-result">
      <motion.div
        className="bg-gray-50 px-4 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="tool-result-header"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {message.name ? (
            <h6 className="font-medium text-sm text-gray-900 flex-shrink-0" data-testid="tool-result-name">
              Tool Result:{" "}
              <code className="bg-gray-100 px-2 py-1 rounded text-sm" data-testid="tool-result-name-code">
                {message.name}
              </code>
            </h6>
          ) : (
            <h6 className="font-medium text-sm text-gray-900 flex-shrink-0" data-testid="tool-result-title">Tool Result</h6>
          )}
          {message.tool_call_id && (
            <code className="text-xs bg-gray-100 px-2 py-0.5 rounded flex-shrink-0" data-testid="tool-result-call-id">
              {message.tool_call_id}
            </code>
          )}
          {!isExpanded && (
            <span className="text-sm text-gray-500 truncate" data-testid="tool-result-preview">
              {preview}
            </span>
          )}
        </div>
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="flex-shrink-0 text-gray-500 hover:text-gray-700 transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          data-testid="tool-result-toggle"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse tool result" : "Expand tool result"}
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </motion.button>
      </motion.div>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden bg-white"
            data-testid="tool-result-content"
          >
            <div className="p-3">
              {isPrimitive ? (
                <pre className="text-sm font-mono bg-gray-50 text-gray-800 p-3 rounded overflow-x-auto whitespace-pre-wrap break-words" data-testid="tool-result-primitive">
                  <code className="block">{String(parsedContent)}</code>
                </pre>
              ) : isJsonContent ? (
                <table className="min-w-full divide-y divide-gray-200" data-testid="tool-result-table">
                  <tbody className="divide-y divide-gray-200">
                    {(Array.isArray(parsedContent)
                      ? parsedContent
                      : Object.entries(parsedContent)
                    ).map((item, argIdx) => {
                      const [key, value] = Array.isArray(parsedContent)
                        ? [argIdx, item]
                        : [item[0], item[1]];
                      return (
                        <tr key={argIdx} data-testid={`tool-result-row-${argIdx}`}>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900 whitespace-nowrap" data-testid={`tool-result-row-${argIdx}-key`}>
                            {key}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500" data-testid={`tool-result-row-${argIdx}-value`}>
                            {isComplexValue(value) ? (
                              <code className="bg-gray-50 rounded px-2 py-1 font-mono text-sm break-all">
                                {JSON.stringify(value, null, 2)}
                              </code>
                            ) : (
                              String(value)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <pre className="text-sm font-mono bg-gray-50 text-gray-800 p-3 rounded overflow-x-auto whitespace-pre-wrap break-words" data-testid="tool-result-text">
                  <code className="block">{contentStr}</code>
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
