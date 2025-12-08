/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { getErrorMessage } from '@google/gemini-cli-core';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from '../ui/commands/types.js';
import { CommandKind } from '../ui/commands/types.js';
import type { ICommandLoader } from './types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import toml from '@iarna/toml';

async function findGeminiDir(): Promise<string | null> {
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const geminiDir = path.join(currentDir, '.gemini');
    try {
      const stats = await fs.stat(geminiDir);
      if (stats.isDirectory()) {
        return geminiDir;
      }
    } catch (_error) {
      // Ignore error if .gemini doesn't exist
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Discovers and loads executable slash commands from .toml files
 * in the .gemini/commands directory.
 */
export class CustomCommandLoader implements ICommandLoader {
  constructor(private readonly config: Config | null) {}

  /**
   * Loads all available commands from the .gemini/commands directory.
   *
   * @param _signal An AbortSignal (unused for this synchronous loader).
   * @returns A promise that resolves to an array of loaded SlashCommands.
   */
  async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    const geminiDir = await findGeminiDir();
    if (!geminiDir) {
      return [];
    }

    const commandsDir = path.join(geminiDir, 'commands');
    const promptCommands: SlashCommand[] = [];

    try {
      const dirents = await fs.readdir(commandsDir, { withFileTypes: true });

      for (const dirent of dirents) {
        if (dirent.isFile() && dirent.name.endsWith('.toml')) {
          const fullPath = path.join(commandsDir, dirent.name);
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const parsed = toml.parse(content);
            const commandName = path.basename(dirent.name, '.toml');
            const description = (parsed as { description?: unknown }).description;

            if (typeof description !== 'string' || !description) {
              continue;
            }
            
            const newPromptCommand: SlashCommand = {
              name: commandName,
              description: description,
              kind: CommandKind.CUSTOM,
              autoExecute: true, // Assuming custom commands don't have args for now
              action: async (
                context: CommandContext,
                args: string,
              ): Promise<SlashCommandActionReturn> => {
                return {
                  type: 'submit_prompt',
                  content: commandName,
                };
              },
              // No completion for now, can be added later
              completion: async () => {
                return [];
              },
            };
            promptCommands.push(newPromptCommand);
          } catch (error) {
            console.error(`Failed to load custom command from ${fullPath}:`, error);
          }
        }
      }
    } catch (error) {
      // If the directory doesn't exist or there's a reading error, do nothing.
    }

    return promptCommands;
  }
}
