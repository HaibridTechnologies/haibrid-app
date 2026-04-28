"""
Helpers for loading Haibrid app data files into Python-friendly structures.

All paths are resolved relative to packages/app/ so this works regardless of
where the notebook is opened from.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# Absolute path to packages/app/ — works from any working directory
APP_DIR = Path(__file__).resolve().parents[2] / "app"


def _load(filename: str) -> Any:
    path = APP_DIR / filename
    if not path.exists():
        return []
    with path.open() as f:
        return json.load(f)


def load_visits() -> list[dict]:
    """Confirmed visit history from visits.json."""
    return _load("visits.json")


def load_pending() -> list[dict]:
    """Pending (unevaluated) visits from visits-pending.json."""
    return _load("visits-pending.json")


def load_feedback() -> dict[str, list[dict]]:
    """User feedback keyed by URL from feedback.json."""
    data = _load("feedback.json")
    return data if isinstance(data, dict) else {}


def load_filters() -> dict:
    """Current visit-filters config (block/allow lists, eval prompt)."""
    return _load("visit-filters.json")


def load_links() -> list[dict]:
    """Full reading list from links.json."""
    return _load("links.json")


def feedback_as_examples() -> list[dict]:
    """
    Flatten feedback into a list of labelled examples suitable for DSPy or
    any other ML pipeline.

    Each example:
      {
        "url":      str,
        "title":    str   (from visits, or empty),
        "domain":   str,
        "decision": "keep" | "drop",
        "reason":   str   (LLM's original reason),
        "comment":  str   (user's free-form correction/note),
      }
    """
    feedback = load_feedback()
    visits_by_url = {v["url"]: v for v in load_visits()}

    examples = []
    for url, entries in feedback.items():
        visit = visits_by_url.get(url, {})
        for entry in entries:
            examples.append({
                "url":      url,
                "title":    visit.get("title", ""),
                "domain":   visit.get("domain", ""),
                "decision": entry.get("decision", ""),
                "reason":   entry.get("reason", ""),
                "comment":  entry.get("comment", ""),
            })
    return examples
