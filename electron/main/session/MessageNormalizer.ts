import type { SDKMessage, SessionMessage } from '../sdk'
import type { AgentRef, PermissionMode, StreamEvent } from '../../../shared/ipc'
import { MAIN_AGENT } from '../../../shared/ipc'

/**
 * Translates the SDK's `SDKMessage` union into our `StreamEvent` union.
 *
 * One instance per session — it is stateful, because several of the mappings need
 * memory across messages:
 *
 *  - **Block identity.** A `stream_event` delta only carries a content-block
 *    *index*. Indices restart at 0 every assistant message, so an index alone is
 *    not a usable React key. We track the current `message.id` per lane and mint
 *    `"<messageId>#<index>"`.
 *
 *  - **Delta/full-message de-duplication.** With `includePartialMessages` the text
 *    arrives twice: once as deltas, then again inside the complete `assistant`
 *    message. We remember which blocks streamed and emit the full text only as a
 *    fallback for blocks that didn't — so the UI is correct whether or not partial
 *    events are enabled, without ever double-rendering.
 *
 *  - **Subagent lanes.** A subagent's messages carry `parent_tool_use_id`, which
 *    equals the `tool_use.id` of the Task call that spawned it. That id becomes the
 *    lane id, so `agent-start` / `agent-end` bracket exactly the right messages.
 */
export class MessageNormalizer {
  /** Current `message.id` per lane, for minting block ids. */
  private readonly currentMessageId = new Map<string, string>()
  /** Block ids that received at least one streaming delta. */
  private readonly streamedBlocks = new Set<string>()
  /** Lanes we've already announced via `agent-start`. */
  private readonly openAgents = new Map<string, AgentRef>()
  /** tool_use ids whose tool is a subagent spawn, so `tool-end` can close the lane. */
  private readonly agentToolUseIds = new Set<string>()

  /** Tool names that spawn a subagent. Both spellings ship across CLI versions. */
  private static readonly AGENT_TOOLS = new Set(['Task', 'Agent'])
  /** Cap on serialized tool input/output crossing IPC. Full payloads can be megabytes. */
  private static readonly PREVIEW_LIMIT = 2000

  /** Map one SDK message to zero or more UI events. */
  normalize(message: SDKMessage): StreamEvent[] {
    switch (message.type) {
      case 'system':
        return message.subtype === 'init' ? this.onInit(message) : []
      case 'stream_event':
        return this.onPartial(message)
      case 'assistant':
        return this.onAssistant(message)
      case 'user':
        return this.onUser(message)
      case 'result':
        return this.onResult(message)
      default:
        // Every other variant is harness bookkeeping the UI has no use for.
        return []
    }
  }

  /**
   * Replay a resumed session's stored transcript as UI events.
   *
   * Necessary because `resume` restores the *model's* context but replays nothing
   * to the SDK consumer — the stream stays completely silent until the next user
   * message. Without this, resuming showed an empty transcript.
   *
   * Reuses the same `onAssistant` / `onUser` paths as live messages, so tool calls,
   * subagent lanes, and thinking blocks reconstruct exactly as they originally
   * appeared. Two adjustments for history:
   *
   *  - `status` events are dropped. They describe what the agent is doing *now*;
   *    replaying them would leave a resumed tab reading "Running tool…".
   *  - Text deltas are tagged `historical` so the renderer paints them immediately
   *    rather than typewriting an entire prior conversation.
   */
  normalizeHistory(messages: SessionMessage[], lane?: AgentRef): StreamEvent[] {
    const events: StreamEvent[] = []

    for (const message of messages) {
      // System entries are compact boundaries and harness notices — not conversation.
      if (message.type === 'system') continue

      const raw = message.message as { role?: string; content?: unknown } | undefined
      if (!raw?.content) continue

      // Shape a stored message into what the live handlers expect. `uuid` stands in
      // for `message.id`, which stored transcripts don't always carry.
      //
      // `lane` overrides the stored `parent_tool_use_id` because a subagent's own
      // transcript file doesn't record which Task call spawned it — that link lives
      // only in the sidecar meta, and the caller has already resolved it.
      const shim = {
        message: { id: message.uuid, ...raw },
        uuid: message.uuid,
        parent_tool_use_id: lane ? lane.id : message.parent_tool_use_id,
        subagent_type: lane?.type,
      }

      const produced =
        message.type === 'assistant'
          ? this.onAssistant(shim as never)
          : this.onUser(shim as never)

      for (const event of produced) {
        if (event.kind === 'status') continue
        if (event.kind === 'text-delta' || event.kind === 'thinking-delta') {
          events.push({ ...event, historical: true })
        } else {
          events.push(event)
        }
      }
    }

    // Stored transcripts include slash-command envelopes and local command output
    // that the CLI renders as chrome, not conversation. Showing them would fill a
    // resumed transcript with `<command-name>/clear</command-name>` noise.
    return events.filter(
      (event) => !(event.kind === 'user-message' && MessageNormalizer.isCommandNoise(event.text)),
    )
  }

  /**
   * Open a lane with details the message stream itself can't supply.
   *
   * Used when replaying a resumed session: the lane's type and description come
   * from the subagent's sidecar meta, not from any message. Registering it here
   * also stops `openLane` emitting a second, detail-free `agent-start` when the
   * replayed messages arrive.
   */
  announceLane(agent: AgentRef, description?: string): StreamEvent[] {
    if (agent.id === MAIN_AGENT.id || this.openAgents.has(agent.id)) return []
    this.openAgents.set(agent.id, agent)
    return [{ kind: 'agent-start', agent, description }]
  }

  /** Close a lane opened by `announceLane`. */
  closeLane(agent: AgentRef): StreamEvent[] {
    if (agent.id === MAIN_AGENT.id || !this.openAgents.delete(agent.id)) return []
    return [{ kind: 'agent-end', agent }]
  }

  private static isCommandNoise(text: string): boolean {
    const trimmed = text.trimStart()
    return (
      trimmed.startsWith('<command-name>') ||
      trimmed.startsWith('<command-message>') ||
      trimmed.startsWith('<local-command-stdout>') ||
      trimmed.startsWith('<user-prompt-submit-hook>')
    )
  }

  private laneOf(message: {
    parent_tool_use_id?: string | null
    subagent_type?: string
  }): AgentRef {
    const parent = message.parent_tool_use_id
    if (!parent) return MAIN_AGENT
    return message.subagent_type ? { id: parent, type: message.subagent_type } : { id: parent }
  }

  /** Emit `agent-start` the first time we see traffic on a subagent lane. */
  private openLane(agent: AgentRef, events: StreamEvent[]): void {
    if (agent.id === MAIN_AGENT.id || this.openAgents.has(agent.id)) return
    this.openAgents.set(agent.id, agent)
    events.push({ kind: 'agent-start', agent })
  }

  private onInit(message: Extract<SDKMessage, { type: 'system'; subtype: 'init' }>): StreamEvent[] {
    return [
      {
        kind: 'session-init',
        sessionId: message.session_id,
        model: message.model,
        cwd: message.cwd,
        permissionMode: message.permissionMode as PermissionMode,
        tools: message.tools ?? [],
        agents: message.agents ?? [],
      },
      { kind: 'status', status: 'ready' },
    ]
  }

  /** Token-level deltas. The hot path — keep allocations here minimal. */
  private onPartial(
    message: Extract<SDKMessage, { type: 'stream_event' }>,
  ): StreamEvent[] {
    const agent = this.laneOf(message)
    const events: StreamEvent[] = []
    this.openLane(agent, events)

    const raw = message.event as {
      type: string
      index?: number
      message?: { id?: string }
      delta?: { type?: string; text?: string; thinking?: string }
    }

    switch (raw.type) {
      case 'message_start': {
        const id = raw.message?.id
        if (id) this.currentMessageId.set(agent.id, id)
        return events
      }

      case 'content_block_delta': {
        const blockId = this.blockId(agent.id, raw.index)
        const delta = raw.delta
        if (!delta) return events

        if (delta.type === 'text_delta' && delta.text) {
          this.streamedBlocks.add(blockId)
          events.push({ kind: 'text-delta', blockId, text: delta.text, agent })
          // Deltas mean the model is producing visible output, not still thinking.
          events.push({ kind: 'status', status: 'streaming' })
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          this.streamedBlocks.add(blockId)
          events.push({ kind: 'thinking-delta', blockId, text: delta.thinking, agent })
          events.push({ kind: 'status', status: 'thinking' })
        }
        // input_json_delta / signature_delta are intentionally dropped: partial tool
        // JSON is not renderable, and the complete input arrives with `tool-start`.
        return events
      }

      case 'content_block_stop': {
        events.push({ kind: 'block-end', blockId: this.blockId(agent.id, raw.index), agent })
        return events
      }

      default:
        return events
    }
  }

  /**
   * A complete assistant message. Two jobs: surface `tool_use` blocks (which never
   * stream in renderable form), and backfill any text block that produced no deltas.
   */
  private onAssistant(
    message: Extract<SDKMessage, { type: 'assistant' }>,
  ): StreamEvent[] {
    const agent = this.laneOf(message)
    const events: StreamEvent[] = []
    this.openLane(agent, events)

    const messageId = message.message.id
    if (messageId) this.currentMessageId.set(agent.id, messageId)

    const content = message.message.content
    if (!Array.isArray(content)) return events

    content.forEach((block, index) => {
      const blockId = `${messageId ?? message.uuid}#${index}`

      if (block.type === 'tool_use') {
        if (MessageNormalizer.AGENT_TOOLS.has(block.name)) {
          this.agentToolUseIds.add(block.id)
        }
        events.push({
          kind: 'tool-start',
          toolUseId: block.id,
          name: block.name,
          input: this.truncateValue(block.input),
          agent,
        })
        events.push({ kind: 'status', status: 'tool' })
        return
      }

      // Fallback path: only fires when this block never streamed (partial events
      // disabled, or a delta was missed). Prevents both loss and duplication.
      if (this.streamedBlocks.has(blockId)) return

      if (block.type === 'text' && block.text) {
        events.push({ kind: 'text-delta', blockId, text: block.text, agent })
        events.push({ kind: 'block-end', blockId, agent })
      } else if (block.type === 'thinking' && block.thinking) {
        events.push({ kind: 'thinking-delta', blockId, text: block.thinking, agent })
        events.push({ kind: 'block-end', blockId, agent })
      }
    })

    return events
  }

  /**
   * User-role messages are either a real user turn or — far more often — the
   * synthetic carrier for tool results coming back from the harness.
   */
  private onUser(message: Extract<SDKMessage, { type: 'user' }>): StreamEvent[] {
    const agent = this.laneOf(message)
    const events: StreamEvent[] = []
    const content = message.message.content

    if (typeof content === 'string') {
      if (content.trim()) events.push({ kind: 'user-message', text: content, agent })
      return events
    }
    if (!Array.isArray(content)) return events

    for (const block of content) {
      if (block.type === 'tool_result') {
        const isError = block.is_error === true
        events.push({
          kind: 'tool-end',
          toolUseId: block.tool_use_id,
          ok: !isError,
          preview: this.previewToolResult(block.content),
          agent,
        })

        // Closing the Task tool closes the subagent lane it opened.
        if (this.agentToolUseIds.delete(block.tool_use_id)) {
          const lane = this.openAgents.get(block.tool_use_id)
          if (lane) {
            this.openAgents.delete(block.tool_use_id)
            events.push({ kind: 'agent-end', agent: lane })
          }
        }
      } else if (block.type === 'text' && block.text.trim() && !message.isSynthetic) {
        events.push({ kind: 'user-message', text: block.text, agent })
      }
    }
    return events
  }

  private onResult(message: Extract<SDKMessage, { type: 'result' }>): StreamEvent[] {
    // Reset per-turn state so the next turn starts clean. The lane maps are
    // intentionally NOT cleared here — a background subagent can outlive a turn.
    this.currentMessageId.clear()
    this.streamedBlocks.clear()

    const ok = message.subtype === 'success' && !message.is_error
    // `usage` mixes plain counts with nested objects (e.g. `cache_creation`), so
    // read it as unknown and pull only the scalar fields we display.
    const usage = (message.usage ?? {}) as unknown as Record<string, unknown>
    const count = (key: string): number =>
      typeof usage[key] === 'number' ? (usage[key] as number) : 0

    return [
      {
        kind: 'result',
        ok,
        text: message.subtype === 'success' ? message.result : `Run ended: ${message.subtype}`,
        durationMs: message.duration_ms ?? 0,
        numTurns: message.num_turns ?? 0,
        usage: {
          inputTokens: count('input_tokens'),
          outputTokens: count('output_tokens'),
          cacheReadTokens: count('cache_read_input_tokens'),
          cacheCreationTokens: count('cache_creation_input_tokens'),
        },
      },
      { kind: 'status', status: ok ? 'idle' : 'error' },
    ]
  }

  private blockId(laneId: string, index: number | undefined): string {
    return `${this.currentMessageId.get(laneId) ?? laneId}#${index ?? 0}`
  }

  /** Bound tool-result text before it crosses IPC. */
  private previewToolResult(content: unknown): string {
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .map((part) =>
                part && typeof part === 'object' && 'text' in part
                  ? String((part as { text: unknown }).text)
                  : '',
              )
              .join('')
          : JSON.stringify(content ?? '')
    return this.truncateText(text)
  }

  private truncateValue(value: unknown): unknown {
    try {
      const json = JSON.stringify(value)
      if (json === undefined) return null
      if (json.length <= MessageNormalizer.PREVIEW_LIMIT) return value
      return { __truncated: true, preview: this.truncateText(json) }
    } catch {
      return { __truncated: true, preview: '[unserializable tool input]' }
    }
  }

  private truncateText(text: string): string {
    if (text.length <= MessageNormalizer.PREVIEW_LIMIT) return text
    const omitted = text.length - MessageNormalizer.PREVIEW_LIMIT
    return `${text.slice(0, MessageNormalizer.PREVIEW_LIMIT)}\n… ${omitted.toLocaleString()} more characters`
  }
}
