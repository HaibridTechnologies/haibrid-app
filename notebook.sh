#!/bin/sh
# Launch JupyterLab from any subfolder of the links-app repo.
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/packages/research" && .venv/bin/jupyter lab notebooks/
