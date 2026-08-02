import type { CommandDefinition } from '../types/command.js';

/**
 * Manager-owned registry. Workers never edit this file — each worker's
 * own `commands/index.ts` calls registerCommand() as a side-effecting
 * import, so no two workers ever touch the same file.
 */
const registry = new Map<string, CommandDefinition>();

export function registerCommand(def: CommandDefinition): void {
  if (registry.has(def.name)) {
    throw new Error(`Command already registered: ${def.name}`);
  }
  registry.set(def.name, def);
}

export function getCommand(name: string): CommandDefinition | undefined {
  return registry.get(name);
}

export function listCommands(): CommandDefinition[] {
  return [...registry.values()];
}

/** Test-only: clears the registry between test files. */
export function __resetRegistryForTests(): void {
  registry.clear();
}
