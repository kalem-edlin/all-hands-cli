/**
 * Trace Command - Query and view observability events
 *
 * Usage:
 *   ah trace list                          # Recent events
 *   ah trace list --agent executor         # Filter by agent type
 *   ah trace list --type tool.pre          # Filter by event type
 *   ah trace list --tool Task              # Filter by tool name
 *   ah trace list --since 1h               # Events from last hour
 *   ah trace stats                         # Aggregate statistics
 *   ah trace stats --since 24h             # Stats for last 24 hours
 */

import { Command } from 'commander';
import { queryEvents, getStats, type TraceEventType, type TraceQueryOptions, ERROR_EVENT_TYPES } from '../lib/trace-store.js';
import { tracedAction } from '../lib/base-command.js';

// ANSI color codes for terminal output
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export function register(program: Command): void {
  const trace = program
    .command('trace')
    .description('Query and view observability events');

  // List events
  trace
    .command('list')
    .description('List trace events with optional filters')
    .option('--agent <type>', 'Filter by agent type (executor, planner, etc.)')
    .option('--agent-id <id>', 'Filter by specific agent ID')
    .option('--type <eventType>', 'Filter by event type (session.start, tool.pre, etc.)')
    .option('--tool <name>', 'Filter by tool name')
    .option('--since <time>', 'Events since time (e.g., 1h, 30m, 2d, or ISO timestamp)')
    .option('--limit <n>', 'Maximum events to return', '50')
    .option('--offset <n>', 'Skip first N events', '0')
    .option('--errors', 'Show only error events')
    .option('--json', 'Output as JSON')
    .action(tracedAction('trace list', (options) => {
      try {
        const queryOpts: TraceQueryOptions = {
          agentType: options.agent,
          agentId: options.agentId,
          eventType: options.type as TraceEventType | undefined,
          toolName: options.tool,
          since: options.since,
          limit: parseInt(options.limit, 10),
          offset: parseInt(options.offset, 10),
          errorsOnly: options.errors,
        };

        const events = queryEvents(queryOpts);

        if (options.json) {
          console.log(JSON.stringify(events, null, 2));
          return;
        }

        if (events.length === 0) {
          console.log('No events found matching filters.');
          return;
        }

        // Human-readable format
        const label = options.errors ? 'error events' : 'events';
        console.log(`\nFound ${events.length} ${label}:\n`);

        for (const event of events) {
          const time = new Date(event.timestamp).toLocaleString();
          const agent = event.agentType ? `[${event.agentType}${event.promptNumber ? `-${event.promptNumber}` : ''}]` : '[main]';
          const tool = event.toolName ? ` ${event.toolName}` : '';
          const isError = event.isError || ERROR_EVENT_TYPES.includes(event.eventType);

          // Highlight errors in red
          if (isError) {
            console.log(`${RED}${BOLD}${time} ${agent} ${event.eventType}${tool}${RESET}`);
          } else {
            console.log(`${time} ${agent} ${event.eventType}${tool}`);
          }

          // Show error details prominently
          if (isError && event.payload) {
            const { error, command_summary, hook, stack } = event.payload as Record<string, unknown>;
            if (error) console.log(`  ${RED}ERROR: ${error}${RESET}`);
            if (command_summary) console.log(`  ${YELLOW}cmd: ${command_summary}${RESET}`);
            if (hook) console.log(`  ${YELLOW}hook: ${hook}${RESET}`);
            if (stack) {
              const stackLines = String(stack).split('\n').slice(0, 3).join('\n    ');
              console.log(`  ${YELLOW}stack:\n    ${stackLines}${RESET}`);
            }
          }
          // Show truncated payload for tool events (non-errors)
          else if (event.eventType.startsWith('tool.') && event.payload) {
            const payloadStr = JSON.stringify(event.payload);
            const display = payloadStr.length > 120 ? payloadStr.slice(0, 120) + '...' : payloadStr;
            console.log(`  ${display}`);
          }

          // Show prompt text for prompt.submit events
          if (event.eventType === 'prompt.submit' && event.payload.prompt) {
            const prompt = String(event.payload.prompt);
            const display = prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt;
            console.log(`  "${display}"`);
          }

          // Show subagent details for agent.spawn
          if (event.eventType === 'agent.spawn' && event.payload) {
            const { subagent_type, description } = event.payload as { subagent_type?: string; description?: string };
            if (subagent_type) console.log(`  type: ${subagent_type}`);
            if (description) console.log(`  desc: ${description}`);
          }
        }

        console.log('');
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    }));

  // Errors shortcut - show only errors
  trace
    .command('errors')
    .description('Show only error events (shortcut for list --errors)')
    .option('--agent <type>', 'Filter by agent type')
    .option('--since <time>', 'Events since time (e.g., 1h, 30m, 2d)')
    .option('--limit <n>', 'Maximum events to return', '50')
    .option('--json', 'Output as JSON')
    .action(tracedAction('trace errors', (options) => {
      try {
        const queryOpts: TraceQueryOptions = {
          agentType: options.agent,
          since: options.since,
          limit: parseInt(options.limit, 10),
          errorsOnly: true,
        };

        const events = queryEvents(queryOpts);

        if (options.json) {
          console.log(JSON.stringify(events, null, 2));
          return;
        }

        if (events.length === 0) {
          console.log('No errors found. Everything is working well!');
          return;
        }

        console.log(`\n${RED}${BOLD}Found ${events.length} errors:${RESET}\n`);

        for (const event of events) {
          const time = new Date(event.timestamp).toLocaleString();
          const agent = event.agentType ? `[${event.agentType}${event.promptNumber ? `-${event.promptNumber}` : ''}]` : '[main]';
          const tool = event.toolName ? ` ${event.toolName}` : '';

          console.log(`${RED}${BOLD}${time} ${agent} ${event.eventType}${tool}${RESET}`);

          // Show error details
          const { error, command_summary, hook, stack, input } = event.payload as Record<string, unknown>;
          if (error) console.log(`  ${RED}ERROR: ${error}${RESET}`);
          if (command_summary) console.log(`  ${YELLOW}cmd: ${command_summary}${RESET}`);
          if (hook) console.log(`  ${YELLOW}hook: ${hook}${RESET}`);
          if (input) {
            const inputStr = JSON.stringify(input);
            const display = inputStr.length > 100 ? inputStr.slice(0, 100) + '...' : inputStr;
            console.log(`  input: ${display}`);
          }
          if (stack) {
            const stackLines = String(stack).split('\n').slice(0, 3).join('\n    ');
            console.log(`  ${YELLOW}stack:\n    ${stackLines}${RESET}`);
          }
          console.log('');
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    }));

  // Stats
  trace
    .command('stats')
    .description('Show aggregate statistics')
    .option('--since <time>', 'Stats since time (e.g., 1h, 30m, 2d)')
    .option('--json', 'Output as JSON')
    .action(tracedAction('trace stats', (options) => {
      try {
        const stats = getStats(options.since);

        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
          return;
        }

        console.log('\n=== Trace Statistics ===\n');
        console.log(`Total Events: ${stats.totalEvents}`);

        if (stats.totalErrors > 0) {
          console.log(`${RED}${BOLD}Total Errors: ${stats.totalErrors}${RESET}`);
        } else {
          console.log(`Total Errors: 0`);
        }

        if (Object.keys(stats.byEventType).length > 0) {
          console.log('\nBy Event Type:');
          for (const [type, count] of Object.entries(stats.byEventType).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${type}: ${count}`);
          }
        }

        if (Object.keys(stats.byAgentType).length > 0) {
          console.log('\nBy Agent Type:');
          for (const [type, count] of Object.entries(stats.byAgentType).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${type}: ${count}`);
          }
        }

        if (Object.keys(stats.byToolName).length > 0) {
          console.log('\nBy Tool:');
          for (const [tool, count] of Object.entries(stats.byToolName).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${tool}: ${count}`);
          }
        }

        console.log('');
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    }));

  // Tail (real-time streaming via file watch)
  trace
    .command('tail')
    .description('Watch trace events in real-time')
    .option('--agent <type>', 'Filter by agent type')
    .option('--type <eventType>', 'Filter by event type')
    .action(tracedAction('trace tail', (options) => {
      const { watch } = require('fs');
      const { join } = require('path');
      const { createReadStream } = require('fs');
      const { createInterface } = require('readline');

      const jsonlPath = join(process.cwd(), '.allhands', 'harness', '.cache', 'trace', 'trace.jsonl');

      console.log(`Watching ${jsonlPath} for new events...`);
      console.log('Press Ctrl+C to stop.\n');

      let position = 0;

      // Get initial file size
      try {
        const { statSync } = require('fs');
        const stat = statSync(jsonlPath);
        position = stat.size;
      } catch {
        // File doesn't exist yet, start from 0
      }

      const processNewLines = () => {
        try {
          const stream = createReadStream(jsonlPath, { start: position });
          const rl = createInterface({ input: stream });

          rl.on('line', (line: string) => {
            if (!line.trim()) return;

            try {
              const event = JSON.parse(line);

              // Apply filters
              if (options.agent && event.agentType !== options.agent) return;
              if (options.type && event.eventType !== options.type) return;

              // Display
              const time = new Date(event.timestamp).toLocaleTimeString();
              const agent = event.agentType ? `[${event.agentType}]` : '[main]';
              const tool = event.toolName ? ` ${event.toolName}` : '';
              console.log(`${time} ${agent} ${event.eventType}${tool}`);
            } catch {
              // Skip malformed lines
            }
          });

          rl.on('close', () => {
            const { statSync } = require('fs');
            try {
              const stat = statSync(jsonlPath);
              position = stat.size;
            } catch {
              // File might have been deleted
            }
          });
        } catch {
          // File might not exist yet
        }
      };

      // Watch for changes
      try {
        watch(jsonlPath, { persistent: true }, (eventType: string) => {
          if (eventType === 'change') {
            processNewLines();
          }
        });
      } catch {
        console.log('Waiting for trace file to be created...');

        // Poll for file creation
        const checkInterval = setInterval(() => {
          const { existsSync } = require('fs');
          if (existsSync(jsonlPath)) {
            clearInterval(checkInterval);
            watch(jsonlPath, { persistent: true }, (eventType: string) => {
              if (eventType === 'change') {
                processNewLines();
              }
            });
          }
        }, 1000);
      }
    }));
}
