#!/bin/bash
set -e

# Ralph Wiggum AFK Mode - Generic Version
# Run with: ./ralph.sh <max_iterations>
#
# This script runs Claude in a loop to autonomously work through tasks in your PRD.
# It's called "Ralph Wiggum" mode because like Ralph, it enthusiastically says "I'm helping!"
# while potentially running unsupervised (use with caution!).

# Configuration - override these with environment variables
PRD_FILE="${RALPH_PRD_FILE:-plans/prd.json}"
PROGRESS_FILE="${RALPH_PROGRESS_FILE:-plans/progress.txt}"
TYPE_CHECK_CMD="${RALPH_TYPE_CHECK_CMD:-npm run type-check}"
TEST_CMD="${RALPH_TEST_CMD:-npm test}"
PROJECT_CONTEXT="${RALPH_PROJECT_CONTEXT:-You are building a software project.}"

# Validate arguments
if [ -z "$1" ]; then
  echo "Usage: ./ralph.sh <max_iterations>"
  echo "Example: ./ralph.sh 10"
  echo ""
  echo "Environment variables (optional):"
  echo "  RALPH_PRD_FILE        - Path to PRD JSON file (default: plans/prd.json)"
  echo "  RALPH_PROGRESS_FILE   - Path to progress log (default: plans/progress.txt)"
  echo "  RALPH_TYPE_CHECK_CMD  - Command to check types (default: npm run type-check)"
  echo "  RALPH_TEST_CMD        - Command to run tests (default: npm test)"
  echo "  RALPH_PROJECT_CONTEXT - Description of your project (default: generic)"
  exit 1
fi

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

MAX_ITERATIONS=$1

echo "🤖 Ralph Wiggum AFK Mode"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 PRD File: $PRD_FILE"
echo "📝 Progress File: $PROGRESS_FILE"
echo "🔄 Max Iterations: $MAX_ITERATIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo ""
  echo "╔════════════════════════════════════════╗"
  echo "║  Ralph iteration $i of $MAX_ITERATIONS"
  echo "╚════════════════════════════════════════╝"
  echo ""

  OUTPUT=$(echo "$PROJECT_CONTEXT

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
- If while implementing you notice ALL PRD tasks are complete, output exactly: RALPH_COMPLETE
" | claude --print --dangerously-skip-permissions --allowedTools "Edit,Write,Bash,Glob,Grep,Read")

  echo "$OUTPUT"

  if [[ "$OUTPUT" == *"RALPH_COMPLETE"* ]]; then
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║  🎉 Ralph completed all PRD items!"
    echo "╚════════════════════════════════════════╝"
    exit 0
  fi

  # Small delay between iterations to avoid rate limits
  sleep 2
done

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  ⏰ Ralph reached max iterations ($MAX_ITERATIONS)"
echo "╚════════════════════════════════════════╝"
echo ""
echo "💡 Tip: Run again with more iterations or review progress in $PROGRESS_FILE"
