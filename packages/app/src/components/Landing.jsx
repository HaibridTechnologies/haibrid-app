/**
 * Landing page — shown on first load before any tab is selected.
 * Mirrors the Haibrid website aesthetic: hero + feature cards.
 */
export default function Landing({ onGetStarted }) {
  return (
    <div className="landing">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="landing-hero">
        <p className="landing-eyebrow">Personal Knowledge OS</p>
        <h1 className="landing-headline">
          Save&nbsp;smarter.<br />Read&nbsp;deeper.
        </h1>
        <p className="landing-sub">
          Capture links, save PDFs, and let AI summarise everything —
          so you can focus on what matters.
        </p>
        <button className="landing-cta" onClick={onGetStarted}>
          Open Reading List →
        </button>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────── */}
      <section className="landing-features">
        <div className="landing-feature-card">
          <div className="landing-feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3 className="landing-feature-title">Reading List</h3>
          <p className="landing-feature-desc">
            Save any URL from your browser in one click. Track what's read,
            unread, and organised by project.
          </p>
        </div>

        <div className="landing-feature-card">
          <div className="landing-feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
          </div>
          <h3 className="landing-feature-title">AI Summaries</h3>
          <p className="landing-feature-desc">
            Every saved page is parsed and summarised by Claude — with
            full abstracts for academic papers.
          </p>
        </div>

        <div className="landing-feature-card">
          <div className="landing-feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3 className="landing-feature-title">Projects</h3>
          <p className="landing-feature-desc">
            Group links into projects and keep research, courses, and
            references cleanly separated.
          </p>
        </div>

        <div className="landing-feature-card">
          <div className="landing-feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          </div>
          <h3 className="landing-feature-title">Browser Extension</h3>
          <p className="landing-feature-desc">
            Save pages directly from Chrome with full content extraction —
            including transcripts for YouTube videos.
          </p>
        </div>

        <div className="landing-feature-card">
          <div className="landing-feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <h3 className="landing-feature-title">PDF Storage</h3>
          <p className="landing-feature-desc">
            arXiv papers and other PDFs are automatically downloaded and
            viewable inline alongside their parsed text.
          </p>
        </div>

        <div className="landing-feature-card">
          <div className="landing-feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <h3 className="landing-feature-title">Task Matrix</h3>
          <p className="landing-feature-desc">
            Prioritise tasks on an impact/effort matrix with drag-and-drop
            scoring. Never lose track of what to do next.
          </p>
        </div>
      </section>

    </div>
  )
}
