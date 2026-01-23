# All Hands CLI

Internal CLI for the All Hands agentic harness.

## Installation

```bash
cd .allhands
npm install
```

## Usage

```bash
npx tsx src/cli.ts <command>
```

Or create an alias:
```bash
alias ah="npx tsx $(pwd)/src/cli.ts"
```

## Optional Dependencies

### Desktop Notifications (macOS)

The `ah notify` command uses [jamf/Notifier](https://github.com/jamf/Notifier) for native macOS notifications.

**Install:**
```bash
brew install --cask notifier
```

**What happens if Notifier isn't installed?**

The notification commands fail gracefully:
- Returns `{ success: false, sent: false, reason: "notifier not available" }` in JSON mode
- Prints "Failed to send notification (notifier not installed?)" in normal mode
- Exits with code 1
- No crash or exception

This allows hooks to safely call `ah notify` without breaking if Notifier isn't installed.

**Usage:**
```bash
# Send a notification
ah notify send "Title" "Message"

# Gate notification (persistent alert - requires dismissal)
ah notify gate "Review" "Plan ready for review"

# Hook notification (auto-dismissing banner)
ah notify hook "Stop" "Agent execution stopped"

# JSON output (for hooks)
ah notify send "Title" "Message" --json
```

**Claude Code Hooks Example:**

In `.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      "ah notify hook Stop \"Agent stopped\""
    ]
  }
}
```

## Commands

Run `ah --help` to see all available commands.

| Command | Description |
|---------|-------------|
| `ah status` | Show milestone status |
| `ah prompt` | Manage prompt files |
| `ah alignment` | Manage alignment doc |
| `ah schema` | Output schemas |
| `ah validate` | Validate files against schemas |
| `ah notify` | Desktop notifications |
| `ah oracle` | LLM inference |
| `ah tavily` | Web search |
| `ah perplexity` | Deep research |
| `ah grok` | X/Twitter search |
| `ah context7` | Library documentation |
| `ah tui` | Launch TUI |
