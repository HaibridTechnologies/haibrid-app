import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

const API_CHAT = '/api/chat'

/**
 * Research tab for a project.
 *
 * Shows a content-loading status bar at the top and a multi-doc chat
 * interface below. The chat sends all parsed project sources as context.
 *
 * @param {Object} project - The active project object (id, name, color)
 */
export default function ProjectResearch({ project }) {
  const [status,      setStatus]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [messages,    setMessages]    = useState([])
  const [history,     setHistory]     = useState([])
  const [input,       setInput]       = useState('')
  const [sending,     setSending]     = useState(false)
  const [models,      setModels]      = useState([])
  const [model,       setModel]       = useState('')
  const [suggestions, setSuggestions] = useState(null)   // null = not yet generated
  const [genLoading,  setGenLoading]  = useState(false)
  const [streaming,   setStreaming]   = useState(true)
  const [atBottom,    setAtBottom]    = useState(true)
  const pollRef      = useRef(null)
  const bottomRef    = useRef(null)
  const messagesRef  = useRef(null)
  const inputRef     = useRef(null)

  /** Generate suggestions client-side from project name + link titles. */
  const buildStaticSuggestions = useCallback(async () => {
    try {
      const res   = await fetch(`/api/links?project=${project.id}`)
      const links = res.ok ? await res.json() : []
      const titles = links
        .filter(l => l.title && l.title !== l.url)
        .map(l => l.title)
        .slice(0, 4)

      const topic = project.name
      const s = []

      if (titles.length >= 2) {
        s.push(`Compare the approaches taken in "${titles[0]}" and "${titles[1]}"`)
      }
      if (titles.length >= 1) {
        s.push(`What are the key findings in "${titles[0]}"?`)
      }
      s.push(`What are the main themes across all ${topic} sources?`)
      if (titles.length >= 3) {
        s.push(`How does "${titles[2]}" relate to the other sources?`)
      } else {
        s.push(`What open questions remain in ${topic}?`)
      }
      s.push(`Summarise the most important insights from this ${topic} collection`)

      setSuggestions(s.slice(0, 5))
    } catch (err) {
      console.error('[ProjectResearch] static suggestions failed:', err)
      setSuggestions([
        `What are the main themes across ${project.name} sources?`,
        'Summarise the key findings',
        'Which sources are most relevant to each other?',
      ])
    }
  }, [project.id, project.name])

  /** Ask the model to generate questions from abstracts/summaries. */
  const generateAISuggestions = async () => {
    setGenLoading(true)
    try {
      const res  = await fetch(`/api/projects/${project.id}/suggest-questions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: model || undefined }),
      })
      const { suggestions: ai } = await res.json()
      if (ai?.length) setSuggestions(ai)
    } catch (err) {
      console.error('[ProjectResearch] AI suggestion generation failed:', err)
    }
    setGenLoading(false)
  }

  // ── Content status ─────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/content-status`)
      if (res.ok) setStatus(await res.json())
    } catch (err) {
      console.error('[ProjectResearch] content status fetch failed:', err)
    }
  }, [project.id])

  useEffect(() => {
    fetchStatus()
    // Load available models once on mount
    fetch('/api/chat/models')
      .then(r => r.json())
      .then(list => { setModels(list); setModel(list.find(m => m.default)?.id || list[0]?.id || '') })
      .catch((err) => console.error('[ProjectResearch] model fetch failed:', err))
  }, [fetchStatus])

  // Generate static suggestions once sources are available
  useEffect(() => {
    if (status?.parsed > 0 && suggestions === null) {
      buildStaticSuggestions()
    }
  }, [status?.parsed, suggestions, buildStaticSuggestions])

  // Poll while any links are pending
  useEffect(() => {
    if (status?.pending > 0 && !pollRef.current) {
      pollRef.current = setInterval(fetchStatus, 3000)
    } else if (!status?.pending && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [status?.pending, fetchStatus])

  // Track whether the user is near the bottom of the message list
  const handleMessagesScroll = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }, [])

  // Auto-scroll only when the user is already at the bottom.
  // Uses instant scroll during streaming (smooth would conflict with rapid updates).
  useEffect(() => {
    if (!atBottom) return
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, atBottom])

  const handleLoadAll = async () => {
    setLoading(true)
    try {
      await fetch(`/api/projects/${project.id}/load-content`, { method: 'POST' })
      await fetchStatus()
    } catch (err) {
      console.error('[ProjectResearch] load content failed:', err)
    }
    setLoading(false)
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  const appendMessage = (role, content) =>
    setMessages(prev => [...prev, { role, content }])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    appendMessage('user', text)
    setSending(true)

    try {
      const res = await fetch(API_CHAT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history, projectId: project.id, model: model || undefined }),
      })
      if (!res.ok) throw new Error(`${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
      let reply     = ''

      // In streaming mode: add an empty bubble and grow it chunk by chunk.
      // In full mode: buffer silently, then reveal the complete message at once.
      if (streaming) {
        setMessages(prev => [...prev, { role: 'assistant', content: '' }])
      }

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.error) throw new Error(data.error)
          if (data.text) {
            reply += data.text
            if (streaming) {
              setMessages(prev => {
                const msgs = [...prev]
                msgs[msgs.length - 1] = { role: 'assistant', content: reply }
                return msgs
              })
            }
          }
          if (data.done) break outer
        }
      }

      if (!streaming) {
        // Reveal the full reply in one render — no jank
        appendMessage('assistant', reply)
      }

      setHistory(prev => [
        ...prev,
        { role: 'user',      content: text  },
        { role: 'assistant', content: reply },
      ])
    } catch {
      appendMessage('system', 'Could not get a reply — check the server.')
    }
    setSending(false)
    inputRef.current?.focus()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const missing = status ? status.total - status.parsed : 0
  const allLoaded = status && status.parsed === status.total && status.total > 0

  return (
    <main className="project-research">

      {/* ── Content status bar ── */}
      <div className="research-status-bar">
        <div className="research-status-left">
          {status ? (
            <>
              <div className="research-status-pill" style={{ borderColor: project.color, color: project.color }}>
                <span className="research-status-dot" style={{ background: project.color }} />
                {status.parsed} / {status.total} sources loaded
              </div>
              {status.pending > 0 && (
                <span className="research-status-note">
                  <span className="research-spinner" /> {status.pending} fetching…
                </span>
              )}
              {status.failed > 0 && (
                <span className="research-status-note research-status-failed">
                  {status.failed} failed
                </span>
              )}
            </>
          ) : (
            <span className="research-status-note">Loading…</span>
          )}
        </div>

        <div className="research-status-right">
          {status && missing > 0 && (
            <button
              className="primary btn-sm"
              onClick={handleLoadAll}
              disabled={loading || status.pending > 0}
            >
              {loading || status.pending > 0
                ? 'Loading sources…'
                : `Load ${missing} missing source${missing !== 1 ? 's' : ''}`}
            </button>
          )}
          {allLoaded && (
            <span className="research-all-loaded">✓ All sources loaded</span>
          )}
        </div>
      </div>

      {/* ── CTA when no content is loaded yet ── */}
      {status && status.parsed === 0 && status.pending === 0 && (
        <div className="research-empty">
          <p className="research-empty-title">No source content loaded yet</p>
          <p className="research-empty-sub">
            Load content to chat with your {status.total} saved link{status.total !== 1 ? 's' : ''}.
          </p>
          <button className="primary" onClick={handleLoadAll} disabled={loading}>
            {loading ? 'Loading…' : 'Load all sources'}
          </button>
        </div>
      )}

      {/* ── Chat ── */}
      {status && status.parsed > 0 && (
        <div className="research-chat">
          {missing > 0 && (
            <div className="research-chat-notice">
              Chatting with {status.parsed} of {status.total} sources —
              {' '}<button className="research-notice-load-btn" onClick={handleLoadAll} disabled={loading || status.pending > 0}>
                load {missing} more
              </button>
            </div>
          )}

          <div className="research-messages-wrap">
          <div
            className="research-messages"
            ref={messagesRef}
            onScroll={handleMessagesScroll}
          >
            {messages.length === 0 && (
              <div className="research-welcome">
                <div className="research-welcome-header">
                  <p>Ask anything about your {status.parsed} loaded source{status.parsed !== 1 ? 's' : ''}.</p>
                  <button
                    className="research-generate-btn"
                    onClick={generateAISuggestions}
                    disabled={genLoading}
                    title="Generate questions from source abstracts"
                  >
                    {genLoading ? <><span className="research-spinner" /> Generating…</> : '✦ Generate questions'}
                  </button>
                </div>
                <div className="research-suggestions">
                  {(suggestions ?? [
                    'Summarise the key themes across all sources',
                    'What are the main findings?',
                    'Which sources are most relevant to each other?',
                  ]).map(s => (
                    <button
                      key={s}
                      className="research-suggestion"
                      onClick={() => { setInput(s); inputRef.current?.focus() }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`research-msg research-msg-${m.role}`}>
                {m.role === 'assistant' ? (
                  <div className="research-bubble">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="research-bubble">{m.content}</div>
                )}
              </div>
            ))}

            {sending && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="research-msg research-msg-assistant">
                <div className="research-bubble research-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Jump-to-bottom pill — appears when user has scrolled up during streaming */}
          {!atBottom && sending && (
            <button
              className="research-jump-btn"
              onClick={() => {
                const el = messagesRef.current
                if (el) el.scrollTop = el.scrollHeight
                setAtBottom(true)
              }}
            >
              ↓ Jump to latest
            </button>
          )}
          </div>

          <div className="research-input-row">
            <textarea
              ref={inputRef}
              className="research-input"
              placeholder="Ask about your sources…"
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }}
            />
            <div className="research-input-actions">
              {models.length > 0 && (
                <select
                  className="research-model-select"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  title="Select model"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.note}
                    </option>
                  ))}
                </select>
              )}
              <div className="research-bottom-controls">
                <button
                  className={`research-stream-toggle ${streaming ? 'active' : ''}`}
                  onClick={() => setStreaming(s => !s)}
                  title={streaming ? 'Streaming on — click to wait for full response' : 'Streaming off — click to enable'}
                >
                  {streaming ? '⚡ Stream' : '◼ Full'}
                </button>
                <button
                  className="research-send-btn primary"
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                >
                  ↑
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
