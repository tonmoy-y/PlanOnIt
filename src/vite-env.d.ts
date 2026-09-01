/// <reference types="vite/client" />
interface ModelContext { registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }): Promise<void>; }
interface WebMCPTool { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown>; execute: (input: any, client?: { signal?: AbortSignal }) => Promise<unknown>; }
interface Document { modelContext?: ModelContext; }
