// ─── AI-assistent (add-on) ───────────────────────────────

/** Eén Anthropic content-blok (tekst / tool_use / tool_result / thinking). */
export interface AiContentBlock {
  type: string;
  text?: string;
  name?: string;
  [key: string]: unknown;
}

export interface AiMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: AiContentBlock[];
  createdAt: string;
}

export interface AiConversation {
  id: string;
  title: string | null;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages?: AiMessage[];
}

export interface AiPendingActionCard {
  id: string;
  toolName: string;
  summary: string;
  args: Record<string, unknown>;
}

export interface AiUsageSummary {
  monthTokens: number;
  monthlyQuota: number;
  remaining: number;
}
