#!/usr/bin/env node
/**
 * claude-envoy: CLI for agent-scoped external tool access.
 *
 * Commands are auto-discovered from the commands/ directory.
 * Each command module registers itself via COMMANDS dict.
 */

import { Command } from "commander";
import { BaseCommand, type CommandClass } from "./commands/base.js";
import { discoverCommands, type CommandValue } from "./commands/index.js";

async function getInfo(
  commands: Map<string, Record<string, unknown>>
): Promise<Record<string, unknown>> {
  const cmdList: string[] = ["info"];

  for (const [group, subcommands] of commands) {
    for (const subcmd of Object.keys(subcommands)) {
      cmdList.push(`${group} ${subcmd}`);
    }
  }

  return {
    status: "success",
    data: {
      version: "0.1.0",
      commands: cmdList.sort(),
      api_keys: {
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY ? "set" : "missing",
        TAVILY_API_KEY: process.env.TAVILY_API_KEY ? "set" : "missing",
        VERTEX_API_KEY: process.env.VERTEX_API_KEY ? "set" : "missing",
        X_AI_API_KEY: process.env.X_AI_API_KEY ? "set" : "missing",
        CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY ? "set" : "missing",
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "set" : "missing",
        ORACLE_DEFAULT_PROVIDER: process.env.ORACLE_DEFAULT_PROVIDER ? "set" : "missing",
      },
      timeout_ms: process.env.ENVOY_TIMEOUT_MS ?? "120000",
    },
  };
}

async function main(): Promise<void> {
  const program = new Command()
    .name("envoy")
    .description("CLI for agent-scoped external tool access")
    .version("0.1.0");

  const commands = await discoverCommands();

  // Register discovered command groups
  for (const [groupName, subcommands] of commands) {
    const group = program
      .command(groupName)
      .description(`${groupName.charAt(0).toUpperCase() + groupName.slice(1)} commands`);

    for (const [subcmdName, subcmdValue] of Object.entries(subcommands)) {
      // Check if this is a nested command group (object with command classes)
      // vs a direct command class (function/class with prototype.execute)
      const isCommandClass = typeof subcmdValue === "function" &&
        typeof (subcmdValue as CommandClass).prototype?.execute === "function";
      const isNestedGroup = !isCommandClass;

      if (isNestedGroup) {
        // Create nested subcommand group (e.g., `knowledge docs`)
        const nestedGroup = group
          .command(subcmdName)
          .description(`${subcmdName.charAt(0).toUpperCase() + subcmdName.slice(1)} commands`);

        for (const [nestedCmdName, NestedCommandClass] of Object.entries(subcmdValue as Record<string, unknown>)) {
          const cmd = new (NestedCommandClass as new () => BaseCommand)();
          cmd.groupName = `${groupName}.${subcmdName}`; // Set group name for logging
          const nestedCmd = nestedGroup
            .command(nestedCmdName)
            .description(cmd.description)
            .option("--agent <name>", "Agent name for logging visibility");

          cmd.defineArguments(nestedCmd);

          nestedCmd.action(async (...actionArgs: unknown[]) => {
            const options = actionArgs[actionArgs.length - 2] as Record<string, unknown>;
            const positionalArgs = actionArgs.slice(0, -2);
            const agent = options.agent as string | undefined;
            delete options.agent;
            const argNames = nestedCmd.registeredArguments.map(arg => arg.name());
            const args: Record<string, unknown> = { ...options };
            positionalArgs.forEach((val, idx) => {
              if (idx < argNames.length) {
                args[argNames[idx]] = val;
              }
            });

            try {
              const result = await cmd.executeWithLogging(args, agent);
              console.log(JSON.stringify(result, null, 2));
            } catch (e) {
              console.log(
                JSON.stringify(
                  {
                    status: "error",
                    error: {
                      type: "execution_error",
                      message: e instanceof Error ? e.message : String(e),
                      command: `${groupName} ${subcmdName} ${nestedCmdName}`,
                    },
                  },
                  null,
                  2
                )
              );
              process.exit(1);
            }
          });
        }
      } else {
        // Direct command class (existing behavior)
        const CommandClass = subcmdValue as new () => BaseCommand;
        const cmd = new CommandClass();
        cmd.groupName = groupName; // Set group name for logging
        const subCmd = group
          .command(subcmdName)
          .description(cmd.description)
          .option("--agent <name>", "Agent name for logging visibility");

        // Let each command define its own arguments
        cmd.defineArguments(subCmd);

        subCmd.action(async (...actionArgs: unknown[]) => {
          // Commander passes positional args first, then options object, then command
          // We need to extract the options object (second to last argument)
          const options = actionArgs[actionArgs.length - 2] as Record<string, unknown>;
          const positionalArgs = actionArgs.slice(0, -2);

          // Extract agent from options (don't include in args)
          const agent = options.agent as string | undefined;
          delete options.agent;

          // Get argument names from command definition
          const argNames = subCmd.registeredArguments.map(arg => arg.name());

          // Build args object from positional arguments and options
          const args: Record<string, unknown> = { ...options };
          positionalArgs.forEach((val, idx) => {
            if (idx < argNames.length) {
              args[argNames[idx]] = val;
            }
          });

          try {
            // Use instrumented execution
            const result = await cmd.executeWithLogging(args, agent);
            console.log(JSON.stringify(result, null, 2));
          } catch (e) {
            console.log(
              JSON.stringify(
                {
                  status: "error",
                  error: {
                    type: "execution_error",
                    message: e instanceof Error ? e.message : String(e),
                    command: `${groupName} ${subcmdName}`,
                  },
                },
                null,
                2
              )
            );
            process.exit(1);
          }
        });
      }
    }
  }

  // Built-in info command
  program
    .command("info")
    .description("Show available commands and API status")
    .action(async () => {
      const result = await getInfo(commands);
      console.log(JSON.stringify(result, null, 2));
    });

  // Handle no command
  if (process.argv.length <= 2) {
    program.help();
  }

  await program.parseAsync();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

