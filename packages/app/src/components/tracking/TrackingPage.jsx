import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getVisits, clearVisits, deleteVisit,
  getConfig, getFilters, saveFilters,
  getPendingVisits, evaluatePending, discardPending,
  saveFeedback,
} from '../../api/visitsApi'
import { addLink } from '../../api/linksApi'
import { getProjects } from '../../api/projectsApi'
import { fmtDwell } from '../../utils/date'

const DEFAULT_FILTERS = { blockList: [], allowList: [], minDwellSeconds: 30, evaluationPrompt: '' }

function fmtDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function DomainListEditor({ label, hint, entries, onChange }) {
  const [input, setInput] = useState('')

  const add = () => {
    const val = input.trim().toLowerCase()
    if (!val || entries.includes(val)) return
    onChange([...entries, val])
    setInput('')
  }

  return (
    <div className="domain-list-editor">
      <div className="tracking-field-label">{label}</div>
      {hint && <div className="tracking-field-hint">{hint}</div>}
      <div className="domain-chips">
        {entries.map(e => (
          <span key={e} className="domain-chip">
            {e}
            <button
              className="chip-remove"
              onMouseDown={() => onChange(entries.filter(x => x !== e))}
            >×</button>
          </span>
        ))}
        <input
          className="domain-chip-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="example.com"
        />
      </div>
    </div>
  )
}

export default function TrackingPage() {
  const [visits,       setVisits]       = useState([])
  const [pending,      setPending]      = useState([])
  const [filters,      setFilters]      = useState(DEFAULT_FILTERS)
  const [days,         setDays]         = useState(30)
  const [search,       setSearch]       = useState('')
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [filterSaved,  setFilterSaved]  = useState(false)
  const [evaluating,     setEvaluating]     = useState(false)
  const [evalResult,     setEvalResult]     = useState(null)   // { kept, dropped, items[] }
  const [evalExpanded,   setEvalExpanded]   = useState(false)
  const [feedbackDrafts, setFeedbackDrafts] = useState({})     // { [visitId]: comment string }
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [feedbackSaved,  setFeedbackSaved]  = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [allProjects,  setAllProjects]  = useState([])
  const [savingVisit,  setSavingVisit]  = useState(null)   // visit id currently being saved
  const [savePopover,  setSavePopover]  = useState(null)   // { visit, selectedProjectId }
  const [savedVisits,  setSavedVisits]  = useState(new Set()) // ids already saved to reading list

  const loadVisits = useCallback(async () => {
    setLoading(true)
    const [v, p] = await Promise.all([
      getVisits({ days, q: search || undefined }).catch(() => []),
      getPendingVisits().catch(() => []),
    ])
    setVisits(v)
    setPending(p)
    setLoading(false)
  }, [days, search])

  useEffect(() => { loadVisits() }, [loadVisits])

  useEffect(() => { getProjects().then(setAllProjects).catch(() => {}) }, [])

  useEffect(() => {
    // Load saved filters; fall back to server config defaults if file doesn't exist yet
    Promise.all([getFilters().catch(() => null), getConfig().catch(() => null)])
      .then(([saved, cfg]) => {
        const base = { ...DEFAULT_FILTERS, minDwellSeconds: cfg?.visits?.minDwellSeconds ?? DEFAULT_FILTERS.minDwellSeconds }
        setFilters(saved ?? base)
      })
  }, [])

  const filterSavedTimerRef  = useRef(null)
  const feedbackSavedTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(filterSavedTimerRef.current)
      clearTimeout(feedbackSavedTimerRef.current)
    }
  }, [])

  const handleSaveFilters = async () => {
    setSaving(true)
    await saveFilters(filters).catch(() => {})
    setSaving(false)
    setFilterSaved(true)
    clearTimeout(filterSavedTimerRef.current)
    filterSavedTimerRef.current = setTimeout(() => setFilterSaved(false), 2000)
  }

  const handleEvaluate = async () => {
    setEvaluating(true)
    setEvalResult(null)
    setFeedbackDrafts({})
    setFeedbackSaved(false)
    // Snapshot pending before the queue is cleared by evaluation
    const pendingSnapshot = [...pending]
    try {
      const result = await evaluatePending()
      // Cross-reference LLM decisions with snapshot to build display items
      const byId = Object.fromEntries((result.results || []).map(r => [r.id, r]))
      const items = pendingSnapshot.map(v => {
        const decision = byId[v.id]
        return {
          id:       v.id,
          url:      v.url,
          title:    v.title || v.url,
          kept:     decision?.keep !== false,
          reason:   decision?.reason || '',
        }
      })
      setEvalResult({ kept: result.kept, dropped: result.dropped, items })
      setEvalExpanded(true)
      await loadVisits()
    } catch {}
    setEvaluating(false)
  }

  const handleSaveFeedback = async () => {
    if (!evalResult?.items) return
    setSavingFeedback(true)
    const entries = evalResult.items
      .filter(item => feedbackDrafts[item.id]?.trim())
      .map(item => ({
        url:      item.url,
        comment:  feedbackDrafts[item.id].trim(),
        decision: item.kept ? 'keep' : 'drop',
        reason:   item.reason,
      }))
    if (entries.length) await saveFeedback(entries).catch(() => {})
    setSavingFeedback(false)
    setFeedbackSaved(true)
    clearTimeout(feedbackSavedTimerRef.current)
    feedbackSavedTimerRef.current = setTimeout(() => setFeedbackSaved(false), 2500)
  }

  const handleSaveToList = async () => {
    if (!savePopover) return
    const { visit, selectedProjectId } = savePopover
    setSavingVisit(visit.id)
    try {
      await addLink(visit.url, '', selectedProjectId ? [selectedProjectId] : [])
      setSavedVisits(prev => new Set([...prev, visit.id]))
    } catch {}
    setSavingVisit(null)
    setSavePopover(null)
  }

  const handleDeleteVisit = async (id) => {
    setVisits(prev => prev.filter(v => v.id !== id))
    await deleteVisit(id).catch(() => loadVisits())
  }

  const handleClearHistory = async () => {
    if (!confirmClear) { setConfirmClear(true); return }
    await clearVisits().catch(() => {})
    setVisits([])
    setConfirmClear(false)
  }

  const handleDiscardPending = async () => {
    if (!confirmDiscard) { setConfirmDiscard(true); return }
    await discardPending().catch(() => {})
    setPending([])
    setConfirmDiscard(false)
  }

  return (
    <main className="tracking-page">

      {/* ── Filter settings ───────────────────────────────────────── */}
      <section className="tracking-section">
        <div className="tracking-section-header">
          <div>
            <h2 className="tracking-section-title">Tracking Filters</h2>
            <p className="tracking-section-desc">
              Control which websites the extension records. Changes take effect within 60 seconds.
            </p>
          </div>
        </div>

        <div className="tracking-filters-grid">
          <div className="tracking-filter-field">
            <label className="tracking-field-label">Minimum dwell time</label>
            <div className="tracking-field-hint">Only record visits longer than this. Filters out accidental clicks and quick bounces.</div>
            <div className="dwell-input-row">
              <input
                type="number"
                className="dwell-input"
                min={5}
                max={300}
                value={filters.minDwellSeconds}
                onChange={e => setFilters(f => ({ ...f, minDwellSeconds: Number(e.target.value) }))}
              />
              <span className="dwell-unit">seconds</span>
            </div>
          </div>

          <DomainListEditor
            label="Fast-track domains"
            hint="Visits to these domains are recorded immediately without LLM evaluation."
            entries={filters.allowList}
            onChange={allowList => setFilters(f => ({ ...f, allowList }))}
          />

          <DomainListEditor
            label="Block list"
            hint="These domains are never recorded, even if visited for a long time."
            entries={filters.blockList}
            onChange={blockList => setFilters(f => ({ ...f, blockList }))}
          />

          <div className="tracking-filter-field">
            <label className="tracking-field-label">Evaluation criteria</label>
            <div className="tracking-field-hint">
              Describe what kinds of websites are worth keeping. Used by the LLM when you click "Parse History" to evaluate the pending queue.
            </div>
            <textarea
              className="eval-prompt-input"
              rows={4}
              placeholder="e.g. Keep technical articles about ML, software engineering, and product design. Drop news aggregators, social media, shopping, and anything without substantive content."
              value={filters.evaluationPrompt}
              onChange={e => setFilters(f => ({ ...f, evaluationPrompt: e.target.value }))}
            />
          </div>
        </div>

        <div className="tracking-filter-actions">
          <button className="primary" onClick={handleSaveFilters} disabled={saving}>
            {filterSaved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Filters'}
          </button>
        </div>
      </section>

      {/* ── Pending queue ─────────────────────────────────────────── */}
      <section className="tracking-section">
        <div className="tracking-section-header">
          <div>
            <h2 className="tracking-section-title">
              Pending Evaluation
              {pending.length > 0 && (
                <span className="pending-count-badge">{pending.length}</span>
              )}
            </h2>
            <p className="tracking-section-desc">
              Visits not on the fast-track or block list. Click "Parse History" to evaluate them against your criteria.
            </p>
          </div>
          <div className="tracking-history-controls">
            <button
              className="primary"
              onClick={handleEvaluate}
              disabled={evaluating || pending.length === 0}
            >
              {evaluating ? 'Evaluating…' : 'Parse History'}
            </button>
            {pending.length > 0 && (
              <button
                className={`btn-ghost${confirmDiscard ? ' btn-danger-ghost' : ''}`}
                onClick={handleDiscardPending}
                onBlur={() => setConfirmDiscard(false)}
              >
                {confirmDiscard ? 'Confirm discard' : 'Discard all'}
              </button>
            )}
          </div>
        </div>

        {evalResult && (
          <div className="eval-results-panel">
            {/* Summary row — always visible, click to expand/collapse */}
            <button
              className="eval-results-summary"
              onClick={() => setEvalExpanded(x => !x)}
            >
              <span className="eval-results-counts">
                <span className="eval-kept-badge">{evalResult.kept} kept</span>
                <span className="eval-dropped-badge">{evalResult.dropped} dropped</span>
              </span>
              <span className="eval-results-toggle">{evalExpanded ? '▲ Hide' : '▼ Show decisions'}</span>
            </button>

            {/* Expandable per-item list */}
            {evalExpanded && (
              <>
                <div className="eval-results-list">
                  {evalResult.items.map(item => (
                    <div key={item.id} className={`eval-result-item ${item.kept ? 'eval-kept' : 'eval-dropped'}`}>
                      <div className="eval-result-header">
                        <span className={`eval-decision-badge ${item.kept ? 'kept' : 'dropped'}`}>
                          {item.kept ? '✓ Kept' : '✕ Dropped'}
                        </span>
                        <a
                          className="eval-result-title"
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={item.url}
                        >
                          {item.title}
                        </a>
                      </div>
                      {item.reason && (
                        <div className="eval-result-reason">{item.reason}</div>
                      )}
                      <textarea
                        className="eval-feedback-input"
                        placeholder="Add a comment… (optional)"
                        rows={2}
                        value={feedbackDrafts[item.id] || ''}
                        onChange={e => setFeedbackDrafts(d => ({ ...d, [item.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="eval-feedback-actions">
                  <button
                    className="primary"
                    onClick={handleSaveFeedback}
                    disabled={savingFeedback || Object.values(feedbackDrafts).every(v => !v?.trim())}
                  >
                    {feedbackSaved ? 'Feedback saved ✓' : savingFeedback ? 'Saving…' : 'Save Feedback'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="card">
          {pending.length === 0 ? (
            <div className="empty">No pending visits — the queue is empty.</div>
          ) : (
            pending.map(v => (
              <div key={v.id} className="visit-item">
                <div className="visit-body">
                  <a className="visit-title" href={v.url} target="_blank" rel="noopener noreferrer">
                    {v.title || v.url}
                  </a>
                  <div className="visit-url">{v.domain}</div>
                </div>
                <div className="visit-meta">
                  <span className="visit-dwell">{fmtDwell(v.dwellSeconds)}</span>
                  <span className="meta-date">{fmtDate(v.queuedAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Visit history ─────────────────────────────────────────── */}
      <section className="tracking-section">
        <div className="tracking-section-header">
          <div>
            <h2 className="tracking-section-title">Visit History</h2>
            <p className="tracking-section-desc">Confirmed visits — fast-tracked or approved by the evaluator.</p>
          </div>
          <div className="tracking-history-controls">
            <select className="days-select" value={days} onChange={e => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <input
              className="tracking-search"
              type="search"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button
              className={`btn-ghost${confirmClear ? ' btn-danger-ghost' : ''}`}
              onClick={handleClearHistory}
              onBlur={() => setConfirmClear(false)}
            >
              {confirmClear ? 'Confirm clear' : 'Clear history'}
            </button>
          </div>
        </div>

        <div className="card">
          {loading ? (
            <div className="empty">Loading…</div>
          ) : visits.length === 0 ? (
            <div className="empty">
              {search ? 'No visits match your search.' : 'No confirmed visits yet.'}
            </div>
          ) : (
            visits.map(v => (
              <div key={v.id} className="visit-item">
                <div className="visit-body">
                  <a className="visit-title" href={v.url} target="_blank" rel="noopener noreferrer">
                    {v.title || v.url}
                  </a>
                  <div className="visit-url">{v.domain}</div>
                </div>
                <div className="visit-meta">
                  <span className="visit-dwell">{fmtDwell(v.dwellSeconds)}</span>
                  <span className="meta-date">{fmtDate(v.visitedAt)}</span>

                  {/* Save to reading list */}
                  {savedVisits.has(v.id) ? (
                    <span className="visit-saved-badge">Saved ✓</span>
                  ) : (
                    <div className="visit-save-wrap">
                      <button
                        className="visit-save-btn"
                        title="Save to reading list"
                        onClick={() => setSavePopover(p =>
                          p?.visit.id === v.id ? null : { visit: v, selectedProjectId: '' }
                        )}
                      >+ Save</button>
                      {savePopover?.visit.id === v.id && (
                        <div className="visit-save-popover">
                          <select
                            className="visit-save-project-select"
                            value={savePopover.selectedProjectId}
                            onChange={e => setSavePopover(p => ({ ...p, selectedProjectId: e.target.value }))}
                          >
                            <option value="">No project</option>
                            {allProjects.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <button
                            className="primary visit-save-confirm"
                            onClick={handleSaveToList}
                            disabled={savingVisit === v.id}
                          >
                            {savingVisit === v.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    className="visit-delete-btn"
                    title="Delete visit"
                    onClick={() => handleDeleteVisit(v.id)}
                  >×</button>
                </div>
              </div>
            ))
          )}
        </div>

        {!loading && visits.length > 0 && (
          <div className="list-count">{visits.length} visit{visits.length !== 1 ? 's' : ''}</div>
        )}
      </section>
    </main>
  )
}
