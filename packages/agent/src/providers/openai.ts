export interface OpenAIOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class OpenAIProvider {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(options: OpenAIOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseURL = options.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.model = options.model || process.env.OPENAI_MODEL || 'gpt-4o';
  }

  async stream(req: {
    system: string;
    messages: any[];
    tools: any[];
    signal: AbortSignal;
    onTextDelta?: (t: string) => void;
  }) {
    if (!this.apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Please provide an OpenAI API key in .env or use the scripted provider.'
      );
    }

    const messages = [
      { role: 'system', content: req.system },
      ...req.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    ];

    const body: Record<string, any> = {
      model: this.model,
      messages,
      stream: true,
    };

    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || `Execute ${t.name}`,
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      }));
    }

    const response = await fetch(`${this.baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error [${response.status}]: ${errText}`);
    }

    let fullText = '';
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
    let stopReason = 'end_turn';

    // Parse SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body stream is not readable');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        if (req.signal.aborted) {
          await reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') break;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const choice = data.choices?.[0];
              if (!choice) continue;

              if (choice.finish_reason) {
                stopReason = choice.finish_reason;
              }

              const delta = choice.delta;
              if (delta?.content) {
                fullText += delta.content;
                if (req.onTextDelta) {
                  req.onTextDelta(delta.content);
                }
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallsMap.has(idx)) {
                    toolCallsMap.set(idx, {
                      id: tc.id || `tc-${Date.now()}-${idx}`,
                      name: tc.function?.name || '',
                      arguments: tc.function?.arguments || '',
                    });
                  } else {
                    const existing = toolCallsMap.get(idx)!;
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.name += tc.function.name;
                    if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                  }
                }
              }
            } catch {
              // Ignore malformed chunk
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCalls = Array.from(toolCallsMap.values()).map((tc) => {
      let args = {};
      try {
        args = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        args = { raw: tc.arguments };
      }
      return {
        id: tc.id,
        name: tc.name,
        arguments: args,
      };
    });

    return {
      text: fullText,
      toolCalls,
      stopReason: toolCalls.length > 0 ? 'tool_use' : stopReason === 'stop' ? 'end_turn' : stopReason,
      usage: {
        inputTokens: Math.round(messages.reduce((acc, m) => acc + m.content.length, 0) / 4),
        outputTokens: Math.round(fullText.length / 4),
      },
      aborted: req.signal.aborted,
    };
  }
}
