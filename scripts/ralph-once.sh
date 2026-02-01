#!/bin/bash
set -e

# Ralph Wiggum Human-in-the-Loop Mode - Generic Version
# Run with: ./ralph-once.sh
#
# This runs a single Ralph iteration with interactive mode enabled.
# Use this when you want to supervise Ralph's work and approve changes.

# Configuration - override these with environment variables
PRD_FILE="${RALPH_PRD_FILE:-plans/prd.json}"
PROGRESS_FILE="${RALPH_PROGRESS_FILE:-plans/progress.txt}"
TYPE_CHECK_CMD="${RALPH_TYPE_CHECK_CMD:-npm run type-check}"
TEST_CMD="${RALPH_TEST_CMD:-npm test}"
PROJECT_CONTEXT="${RALPH_PROJECT_CONTEXT:-You are building a software project.}"

# Validate files exist
if [ ! -f "$PRD_FILE" ]; then
  echo "❌ Error: PRD file not found at $PRD_FILE"
  echo "Run 'ralph-init' to set up Ralph for this project"
  exit 1
fi

if [ ! -f "$PROGRESS_FILE" ]; then
  echo "⚠️  Warning: Progress file not found at $PROGRESS_FILE"
  echo "Creating it now..."
  mkdir -p "$(dirname "$PROGRESS_FILE")"
  echo "# Project Progress Log" > "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "## Ralph Wiggum Sessions" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  🤖 Ralph (Interactive Mode)"
echo "╚════════════════════════════════════════╝"
echo ""
echo "📋 PRD File: $PRD_FILE"
echo "📝 Progress File: $PROGRESS_FILE"
echo ""

claude --dangerously-disable-sandbox \
  "$PROJECT_CONTEXT

Read the following files to understand what needs to be done:
- $PRD_FILE (the product requirements document with tasks)
- $PROGRESS_FILE (notes from previous work sessions)

Follow these steps:
1. Find the highest priority task to work on from the PRD that is not yet passing. This should be the one YOU decide has the highest priority based on dependencies, not necessarily the first one in the list.
2. Implement ONLY that single task. Check that types check via '$TYPE_CHECK_CMD' and that tests pass via '$TEST_CMD'.
3. Update the PRD ($PRD_FILE) marking the completed item as passes: true
4. APPEND your progress to $PROGRESS_FILE - leave notes for the next work session about what was done and what might be good to work on next
5. Make a git commit with your changes

IMPORTANT:
- Only work on a SINGLE task per iteration
- Keep changes small and focused
- If while implementing you notice ALL PRD tasks are complete, output exactly: RALPH_COMPLETE"
