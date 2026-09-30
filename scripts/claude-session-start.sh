#!/usr/bin/env bash
# Chạy khi mở phiên Claude Code. Chỉ làm việc trên cloud (Claude Code on the web),
# nơi mỗi phiên bắt đầu từ bản clone sạch chưa có node_modules.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
node --version
npm ci --no-audit --no-fund
