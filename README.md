# Haibrid App

A research-focused reading list manager — save links from the browser extension, auto-fetch content and summaries, organise into projects, and chat with your saved pages.

---

## Features

### Web App

**Reading List**
- Save links by URL with optional notes and project tags
- Filter by Unread / All / Read
- Full-text search across URL, title, and notes
- Mark links read or unread, with one-click undo
- Delete links with undo
- Click any link title to rename it inline
- Edit project tags per link inline

**Link Detail**
- View full metadata: URL, notes, date added
- Save page content — plain text is extracted, cleaned, and stored locally
- AI summary generated automatically after content is saved
- Inline PDF viewer for downloadable papers
- Citation count pulled from Semantic Scholar (arXiv links)
- User comments — add timestamped notes to any link, delete individually

**Projects**
- Organise links into named, colour-coded projects
- Each project shows a link count and its own filtered view
- Unassigned folder collects read links with no project
- Deleting a project removes its tag from all links — no orphaned data

**Import & Export**
- Select individual links with checkboxes and export as a JSON file
- Import a JSON file — new links are added, existing links get the project tag merged in
- Import and export are scoped to a specific project

**Content Browser**
- Browse all links that have saved page content in one place

**Browsing History & Tracking**
- Automatic dwell-time tracking across all browser tabs
- Allow list and block list to control which domains are recorded
- Configurable minimum dwell threshold to filter out bounces

---

### Browser Extension

**Save Tab**
- Save the current page with one click — title is pre-filled from the page
- Add optional notes and assign to one or more projects (create new projects inline)
- If the page is already saved, the tab switches to management mode:
  - Rename the title
  - Edit project tags
  - Save page content (or see its status if already saved or in progress)
  - Mark as read or unread
  - Add, view, and delete comments
  - Toggle the sticky note on/off for the current page
  - Remove from list

**Unread Tab**
- See all unread links at a glance
- Mark individual links as read without leaving the popup

**Search Tab**
- Search across all saved links by title, URL, or notes
- Results update as you type (250 ms debounce)
- Toggle read/unread on any result inline

**Chat Tab**
- Chat with an AI assistant with context from the current page
- Uses saved page content automatically if available
- Highlight text on the page and right-click → "Ask Haibrid about this" to send a selection directly
- Toggle web search on or off per conversation
- Markdown rendered in responses (bold, code blocks, lists)

**Sticky Notes**
- Pages with comments show a draggable sticky note when you visit them
- Navigate through multiple comments with prev / next arrows
- Drag the note to any position — it remembers where you left it
- Close the note with × or toggle it from the extension popup

**Background Tracking**
- Dwell time is recorded automatically for every tab (no setup needed)
- Visits below the minimum threshold or on blocked domains are silently discarded
- Filter configuration is fetched from the server and cached

---

The monorepo contains three packages:

| Package | Description |
|---|---|
| `packages/app` | Express API + React (Vite) web app |
| `packages/extension` | Chrome / Edge browser extension (MV3) |
| `packages/research` | Python research package + Jupyter notebooks |

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| npm | ≥ 9 (bundled with Node) |
| Python | ≥ 3.11 (research package only) |
| Google Chrome or Edge | Any recent version |

---

## 1 — Clone & install

```bash
git clone https://github.com/HaibridTechnologies/haibrid-app.git
cd haibrid-app
npm install
```

This installs dependencies for both `packages/app` and `packages/extension` via npm workspaces.

---

## 2 — Environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

Open `.env` and set the following:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Powers content summarisation, visit evaluation, and in-extension chat. Get one at [console.anthropic.com](https://console.anthropic.com/). |
| `LANGSMITH_TRACING` | No | Set to `true` to enable LangSmith request tracing. |
| `LANGSMITH_ENDPOINT` | No | LangSmith ingestion endpoint (default: `https://api.smith.langchain.com`). |
| `LANGSMITH_API_KEY` | No | Your LangSmith API key — only needed if tracing is enabled. |
| `LANGSMITH_PROJECT` | No | LangSmith project name to group traces under. |

The `.env` file lives at the **repo root** — the server loads it automatically on startup.

---

## 3 — Run the web app

```bash
npm run dev
```

This starts two processes in parallel:

- **Express API** on `http://localhost:3000`
- **Vite dev server** on `http://localhost:5173`

Open `http://localhost:5173` in your browser.

> **First run:** the app stores its data as JSON files in `packages/app/` (`links.json`, `visits.json`, etc.). These are created automatically and are excluded from version control.

---

## 4 — Load the browser extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `packages/extension` folder

The extension icon will appear in your toolbar. It connects to `http://localhost:3000`, so the server must be running.

---

## 5 — Research package & Jupyter notebooks (optional)

The `packages/research` package contains experiment notebooks for prompt optimisation using DSPy.

### Set up the Python environment

```bash
cd packages/research
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

### Launch JupyterLab

From anywhere inside the repo:

```bash
./notebook.sh
```

Or from the repo root:

```bash
npm run notebook
```

JupyterLab will open at `http://localhost:8888`. Notebooks live in `packages/research/notebooks/`.

---

## Production build

To build the React app for production and serve it from Express:

```bash
npm run build   # builds Vite output into packages/app/dist/
npm run start   # starts Express on port 3000 serving the built app
```

---

## Project structure

```
haibrid-app/
├── .env.example              # Environment variable template
├── package.json              # Workspace root
├── packages/
│   ├── app/
│   │   ├── server.js         # Express server
│   │   ├── contentQueue.js   # Background fetch / parse / summarise queue
│   │   ├── lib/              # Shared server utilities
│   │   ├── routes/           # API route handlers
│   │   └── src/              # React frontend (Vite)
│   ├── extension/
│   │   ├── manifest.json     # Chrome extension manifest (MV3)
│   │   ├── popup.html/js/css # Extension popup UI
│   │   ├── background.js     # Service worker
│   │   └── content.js        # Injected content script
│   └── research/
│       ├── pyproject.toml    # Python package definition
│       ├── research/         # Python source (data loaders, etc.)
│       └── notebooks/        # Jupyter experiment notebooks
└── notebook.sh               # Shortcut to launch JupyterLab
```
