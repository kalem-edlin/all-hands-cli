# Transcript Safeguard Bug Fix

## Problem

The `PostToolUse:TaskOutput` transcript-safeguard hook silently allows raw JSONL transcript dumps through to the parent agent's context, causing context explosion. The hook detection logic (`isTranscriptDump`) works correctly, but three independent bugs in the execution chain prevent the hook from ever successfully blocking a transcript dump.

## Bug Analysis

### Bug 1: Daemon does not apply `errorFallback` strategies

**File:** `.allhands/harness/src/hooks/shared.ts:761-765`

`registerCategoryForDaemon` registers raw handler functions with no error wrapping:

```typescript
export function registerCategoryForDaemon(category: HookCategory, register: RegisterFn): void {
  for (const hook of category.hooks) {
    register(category.name, hook.name, hook.handler); // no try/catch, no errorFallback
  }
}
```

In CLI mode, `registerCategory` (lines 733-755) wraps every handler in try/catch with `executeErrorFallback`. In daemon mode, the per-hook `errorFallback` declarations are dead code. When a handler throws, the daemon's generic error handling returns `{ success: false, error: "..." }` instead of respecting the hook's declared fallback strategy.

**Impact:** Every hook's `errorFallback` configuration is ignored when running through the daemon.

### Bug 2: Daemon returns empty response for detected transcripts

When `isTranscriptDump()` returns true and the handler proceeds to summarization, the daemon returns 0 bytes (connection closes without a response). Verified with payloads as small as 50 fake transcript lines (~10KB). Payloads that do NOT trigger detection (below the 5000 char threshold) return correctly.

The likely cause is that `logEvent()` or `logHookSuccess()` (called before `summarizeTranscriptDump`) throws in the daemon context, and the async `data` callback in `cli-daemon.ts:165-201` fails to write a response before the connection closes.

**Impact:** The daemon silently drops the connection when transcript detection fires.

### Bug 3: `ah` script consumes stdin then loses it on fallthrough

**File:** `.allhands/harness/ah:70-116`

When the daemon path is entered (socket exists), stdin is consumed on line 79:

```bash
INPUT=$(cat)
```

If the daemon returns an error or empty response, the script falls through to the tsx slow path on line 116:

```bash
exec "$SCRIPT_DIR/node_modules/.bin/tsx" "$SCRIPT_DIR/src/cli.ts" "$@"
```

But stdin has already been consumed. The tsx process gets empty stdin, `readHookInput()` parses it as `{}`, the handler sees no `tool_name`, and `allowTool()` is called unconditionally.

**Impact:** Even when the daemon fails and the slow path should recover, the hook receives empty input and passes everything through.

### Failure chain

All three bugs converge:

1. Daemon receives hook input and detects transcript dump
2. Handler errors during summarization (Bug 1: no errorFallback applied)
3. Daemon returns empty response (Bug 2: connection dropped)
4. `ah` script falls through to slow path with empty stdin (Bug 3: stdin consumed)
5. Slow path handler sees `{}`, calls `allowTool()`
6. Raw transcript dump flows into parent agent context

## Fix Plan

### Fix 1: Wrap daemon handlers with `errorFallback` logic

**File:** `.allhands/harness/src/hooks/shared.ts`

Update `registerCategoryForDaemon` to wrap handlers the same way `registerCategory` does:

```typescript
export function registerCategoryForDaemon(category: HookCategory, register: RegisterFn): void {
  for (const hook of category.hooks) {
    const wrappedHandler = async (input: HookInput): Promise<void> => {
      try {
        await hook.handler(input);
      } catch {
        executeErrorFallback(hook.errorFallback, `${category.name}.${hook.name}`);
      }
    };
    register(category.name, hook.name, wrappedHandler);
  }
}
```

### Fix 2: Pass consumed stdin to the slow path fallback

**File:** `.allhands/harness/ah`

When the daemon path fails and falls through, pipe the consumed `$INPUT` to the tsx process:

```bash
# Replace the final exec line with a conditional:
if [ -n "$INPUT" ]; then
    # Daemon path was entered but failed - replay consumed stdin
    echo "$INPUT" | exec "$SCRIPT_DIR/node_modules/.bin/tsx" "$SCRIPT_DIR/src/cli.ts" "$@"
else
    # Normal slow path - stdin is still available
    exec "$SCRIPT_DIR/node_modules/.bin/tsx" "$SCRIPT_DIR/src/cli.ts" "$@"
fi
```

Note: `$INPUT` is only set inside the daemon `if` block (line 79), so it will be empty when the daemon path is not entered.

### Fix 3: Guard `logEvent`/`logHookSuccess` in `transcriptSafeguard`

**File:** `.allhands/harness/src/hooks/context.ts:1443-1500`

Wrap the logging calls in try/catch so they cannot crash the handler before summarization runs:

```typescript
async function transcriptSafeguard(input: HookInput): Promise<void> {
  if (input.tool_name !== 'TaskOutput') {
    return allowTool(HOOK_TRANSCRIPT_SAFEGUARD);
  }

  const toolResult = input.tool_result;
  if (!toolResult) {
    return allowTool(HOOK_TRANSCRIPT_SAFEGUARD);
  }

  const resultStr = typeof toolResult === 'string'
    ? toolResult
    : JSON.stringify(toolResult);

  if (!isTranscriptDump(resultStr)) {
    return allowTool(HOOK_TRANSCRIPT_SAFEGUARD);
  }

  // Guard logging so it cannot crash the handler
  try {
    logEvent('harness.error', {
      source: 'context.transcript-safeguard',
      bug: 'claude-code-taskoutput-transcript-dump',
      resultLength: resultStr.length,
    });
    logHookSuccess(HOOK_TRANSCRIPT_SAFEGUARD, {
      action: 'summarize',
      originalLength: resultStr.length,
    });
  } catch {
    // Logging failure must not prevent summarization
  }

  const originalPrompt = extractOriginalPrompt(input);
  const summary = await summarizeTranscriptDump(resultStr, originalPrompt);

  const parts: string[] = [
    '## TaskOutput Result (Summarized)',
    '',
    '**Note**: The agent returned a full transcript dump instead of its result.',
    'This has been automatically summarized to prevent context explosion.',
    '(This is a known Claude Code bug - occurrence logged for tracking)',
    '',
    '---',
    '',
    summary,
  ];

  outputContext(parts.join('\n'), HOOK_TRANSCRIPT_SAFEGUARD);
}
```

## Validation

### Prerequisites

Rebuild the harness after making changes:

```bash
cd .allhands/harness && npx tsc
```

If the daemon is running (TUI active), restart the TUI session so the daemon loads the new code.

### Test 1: Direct handler detection (tsx slow path)

Verify the detection logic and summarization work end-to-end, bypassing the daemon:

```bash
# Create compact test input from the test transcript file
jq -c -n --rawfile content test_task_response.json \
  '{tool_name: "TaskOutput", tool_input: {task_id: "test-123"}, tool_result: $content}' \
  > /tmp/hook_test_input.json

# Run via tsx directly (bypasses daemon)
DISABLE_DAEMON=true ah hooks context transcript-safeguard < /tmp/hook_test_input.json
```

**Expected:** JSON output containing `{"decision":"block","reason":"## TaskOutput Result (Summarized)..."}`. The reason should contain either a Gemini summary or a "Summarization Failed" fallback with the first 3000 chars.

**Failure looks like:** Empty output (no stdout), which means `allowTool()` was called.

### Test 2: Daemon path

Verify the daemon correctly processes the hook (requires TUI/daemon running):

```bash
# Send directly to daemon via Python to avoid ah script intermediation
python3 -c "
import json, socket

content = open('test_task_response.json').read()
hook_input = {'tool_name': 'TaskOutput', 'tool_input': {'task_id': 'test'}, 'tool_result': content}
cmd = json.dumps({'cmd': 'hook', 'category': 'context', 'name': 'transcript-safeguard', 'input': hook_input})

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.settimeout(60)
sock.connect('.allhands/harness/.cache/cli-daemon.sock')
sock.sendall((cmd + chr(10)).encode())
sock.shutdown(socket.SHUT_WR)

response = b''
try:
    while True:
        data = sock.recv(4096)
        if not data:
            break
        response += data
except socket.timeout:
    print('TIMEOUT')
sock.close()

resp = json.loads(response.decode())
print('success:', resp.get('success'))
print('output length:', len(resp.get('output', '')))
print('output preview:', resp.get('output', '')[:300])
"
```

**Expected:** `success: true` with a non-empty `output` containing the block decision JSON.

**Failure looks like:** `success: true` with empty output (errorFallback fired), or `success: false` with an error message, or 0 bytes (connection dropped).

### Test 3: Full `ah` script path

Verify the complete path including the `ah` bash script:

```bash
jq -c -n --rawfile content test_task_response.json \
  '{tool_name: "TaskOutput", tool_input: {task_id: "test-123"}, tool_result: $content}' \
  | ah hooks context transcript-safeguard
```

**Expected:** Same as Test 1 - JSON output with `decision: "block"`.

**Failure looks like:** Empty output. If this fails but Test 1 passes, the issue is in the daemon or `ah` script fallthrough.

### Test 4: Non-transcript TaskOutput (regression check)

Verify normal TaskOutput results are not blocked:

```bash
echo '{"tool_name":"TaskOutput","tool_input":{"task_id":"test"},"tool_result":"Here is the agent result: everything looks good."}' \
  | ah hooks context transcript-safeguard
```

**Expected:** Empty output (no stdout), exit code 0. This means `allowTool()` was called correctly - normal results pass through.

### Test 5: Live end-to-end test

Spawn a task that will trigger the Claude Code transcript dump bug:

```bash
# In a Claude Code session, run a Task that reads and returns the test file contents
# The TaskOutput should trigger the PostToolUse:TaskOutput hook
# Verify the parent agent receives a summary, not the raw JSONL transcript
```

The `test_task_response.json` file at the project root contains a real transcript dump captured from a previous occurrence of this bug. Use it as the fixture for tests 1-4.
