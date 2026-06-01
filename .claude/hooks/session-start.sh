#!/bin/bash
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
# No dependencies yet. When Node.js/Expo stack is added, run: npm install
echo "Session start hook: no dependencies to install."
