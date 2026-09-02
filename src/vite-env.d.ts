/// <reference types="vite/client" />
interface ModelContext { registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }): Promise<void>; }
interface WebMCPTool { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown>; execute: (input: unknown, client?: { signal?: AbortSignal }) => Promise<unknown>; }
interface Document { modelContext?: ModelContext; }

// No credential is ever read into the browser bundle: anything prefixed VITE_ is public.
interface ImportMetaEnv { readonly VITE_PLANONIT_AUTHORITY_ENDPOINT?: string; }
interface ImportMeta { readonly env: ImportMetaEnv; }
