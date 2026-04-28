# Haibrid Links App — Developer Guide

## Style Guide

### Design Philosophy
Clean, professional, and minimal — consistent with the Haibrid brand. Deep navy text on light blue-gray backgrounds, with a bright blue primary accent. Generous white space, subtle shadows, and soft transitions. Avoid heavy borders, harsh contrasts, or decorative flourishes.

---

### Color Tokens

All colors are defined as CSS custom properties in `packages/app/src/styles/global.css` and mirrored in `packages/extension/popup.css`. **Never use raw hex values in components — always reference a token.**

#### Surfaces
| Token | Value | Use |
|---|---|---|
| `--bg` | `#F7F9FC` | Page background |
| `--surface` | `#FFFFFF` | Cards, modals, inputs |
| `--surface-2` | `#F1F5FB` | Slightly elevated areas, hover states |

#### Borders
| Token | Value | Use |
|---|---|---|
| `--border` | `#E3E8F0` | Default borders |
| `--border-light` | `#EEF2F8` | Subtle dividers, list separators |

#### Text
| Token | Value | Use |
|---|---|---|
| `--text` | `#0F1C35` | Primary text (headings, titles) |
| `--text-2` | `#344563` | Secondary text (body copy) |
| `--muted` | `#5E7494` | Labels, metadata, placeholder-level text |
| `--muted-light` | `#8FA3BC` | Timestamps, disabled states, subtle hints |
| `--read-text` | `#9EB0C7` | Strikethrough / read items |

#### Accent (primary blue)
| Token | Value | Use |
|---|---|---|
| `--accent` | `#2563EB` | Buttons, links, active indicators, focus rings |
| `--accent-hover` | `#1D4ED8` | Hover state for accent elements |
| `--accent-light` | `#EFF6FF` | Subtle blue highlight, active filter tabs |
| `--accent-mid` | `#DBEAFE` | Chip borders, mild accent fills |

#### Semantic
| Token | Value | Use |
|---|---|---|
| `--danger` / `--danger-light` / `--danger-border` | `#EF4444` / `#FEF2F2` / `#FECACA` | Errors, delete actions |
| `--success` / `--success-light` / `--success-border` | `#059669` / `#ECFDF5` / `#A7F3D0` | Completed, parsed, read states |
| `--warning` / `--warning-light` / `--warning-border` | `#D97706` / `#FFFBEB` / `#FDE68A` | Pending states, notices |

#### Misc
| Token | Value | Use |
|---|---|---|
| `--white` | `#FFFFFF` | Text/icons on coloured backgrounds (buttons, icon boxes) |
| `--hover-bg` | `#F5F8FF` | Row/list-item hover tint |
| `--on-dark` | `#F1F5F9` | Primary text on dark surfaces (snackbar) |
| `--on-dark-muted` | `#94A3B8` | Secondary text on dark surfaces |
| `--snackbar-action` | `#93C5FD` | Action link colour inside snackbar |

**Rule: never use raw hex values in component files or CSS rules — always reference a token. If a value is used more than once and has no token, add one to `:root`.**

---

### Typography

**Font family:** Inter (loaded from Google Fonts), falling back to system sans-serif.

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

Always set `font-family: inherit` on inputs and buttons so they pick up Inter.
Use `-webkit-font-smoothing: antialiased` on `body`.

| Use | Size | Weight | Notes |
|---|---|---|---|
| Nav title / modal heading | 15px | 700 | `letter-spacing: -0.3px` |
| Item title / card name | 14px | 600–700 | `letter-spacing: -0.15px` |
| Body text | 14px | 400–500 | |
| Secondary text | 13px | 400 | `color: var(--text-2)` |
| Small labels / metadata | 12px | 400–500 | `color: var(--muted)` |
| Uppercase labels | 11px | 600 | `text-transform: uppercase; letter-spacing: 0.5px` |

---

### Shape & Spacing

| Token | Value | Use |
|---|---|---|
| `--radius` | `8px` | Default — inputs, buttons, cards |
| `--radius-lg` | `12px` | Larger cards, modals |
| `--radius-sm` | `5px` | Badges, small pills, icon buttons |

Main content padding: `28px` horizontal, `20px` top.
List item padding: `12px 18px`.
Card/modal body padding: `18px 22px`.

---

### Elevation (shadows)

| Token | Use |
|---|---|
| `--shadow-xs` | Subtle — nav bar |
| `--shadow-sm` | Default card |
| `--shadow-md` | Hovered card, dropdowns |
| `--shadow-lg` | Floating dropdowns, tooltips |
| `--shadow-xl` | Modals, dialogs |

All shadows use `rgba(15,28,53, ...)` (deep navy) — never black-based shadows.

---

### Component Patterns

**Buttons**
- Primary: `button.primary` — solid accent background, white text, `font-weight: 600`
- Ghost: `.btn-ghost` — transparent with `--border` border, muted text
- Secondary (extension only): `.btn-secondary` — white bg, accent text, `--accent-mid` border
- Danger: `.btn-danger` — white bg, danger text, danger border

**Cards**
- Use `.card` class: white background, `--border` border, `--radius-lg`, `--shadow-sm`
- On hover: `--shadow-md` + `translateY(-2px)`

**Badges / pills**
- Use `border-radius: 10px`, `padding: 2px 8px`, `font-size: 11px`, `font-weight: 500`
- Unread: `--accent-light` bg, `--accent` text, `--accent-mid` border
- Read/success: `--success-light` bg
- Pending/warning: `--warning-light` bg
- Error: `--danger-light` bg

**Focus rings**
```css
box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
border-color: var(--accent);
```

**Modal overlay**
```css
background: rgba(15,28,53,0.40);
backdrop-filter: blur(2px);
```

**Active nav tabs / filter tabs**
```css
background: var(--accent-light);
border-color: var(--accent-mid);
color: var(--accent);
font-weight: 600;
```

---

### Component Reuse

**Rule: if a UI pattern appears in more than one place, it must be a shared component.** Do not copy-paste JSX — extract it.

#### Existing shared components
| Component | Path | Use |
|---|---|---|
| `AppNav` | `components/AppNav.jsx` | Top navigation bar, tab switching |
| `Snackbar` | `components/Snackbar.jsx` | Undo / notification toasts |
| `LinkItem` | `components/links/LinkItem.jsx` | Single row in reading list or project view |
| `LinkModal` | `components/links/LinkModal.jsx` | Detail modal — content, abstract, summary, PDF |

#### When to extract a component
- The same JSX block (>5 lines) appears in 2+ places → extract immediately
- A pattern takes props to vary its output → it is a component, not an inline block
- Anything with its own state (open/closed, loading, hover) → it is a component

#### Naming conventions
- Components: `PascalCase.jsx`, one component per file
- Shared UI primitives (Badge, Spinner, EmptyState): live in `components/ui/`
- Page-level components: live in `components/{feature}/`

#### Shared primitives to add when needed
Before writing inline JSX for these, check `components/ui/` first — and create the file there if it doesn't exist yet:
- `Badge` — status pill (unread / read / parsed / pending / failed)
- `Spinner` — loading indicator
- `EmptyState` — centred empty message with optional CTA
- `SectionLabel` — uppercase 11px label used above content sections

---

### AI Features

- Prompt definitions live in `packages/app/lib/prompts.js` as named exports with `{ model, max_tokens, system }`.
- The summarisation model is `claude-haiku-4-5-20251001`. Change model/tokens there without touching code.
- `ANTHROPIC_API_KEY` must be set in the environment when running the server.

---

### File Structure (key paths)

```
packages/app/
  server.js              Express server + routes registration
  contentQueue.js        Background fetch/parse/summarise queue
  lib/
    prompts.js           AI prompt definitions (model + system prompt)
    summarize.js         Anthropic API wrapper
    siteHandlers.js      Site-specific parsers (arXiv, YouTube)
    downloadPdf.js       PDF download + MIME detection
    http.js              fetchUrl / fetchHtml helpers
    htmlToText.js        HTML → plain text
    storage.js           links.json / projects.json read/write
  routes/
    links.js             CRUD for links
    content.js           Content save/fetch/delete endpoints
    projects.js          Projects CRUD
    tasks.js             Tasks CRUD
  content/               Saved plain-text files ({id}.txt)
  pdfs/                  Downloaded PDF files ({id}.pdf)
packages/extension/
  popup.html / popup.js / popup.css   Browser extension UI
```
