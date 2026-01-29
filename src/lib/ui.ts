import { existsSync, readdirSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import * as readline from 'readline';

export type ConflictResolution = 'backup' | 'overwrite' | 'cancel';

export async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function confirm(message: string): Promise<boolean> {
  const answer = await askQuestion(`${message} [y/N]: `);
  return answer.toLowerCase() === 'y';
}

export async function askConflictResolution(conflicts: string[]): Promise<ConflictResolution> {
  console.log(`\n${'!'.repeat(60)}`);
  console.log('CONFLICTS DETECTED - The following files differ from source:');
  console.log(`${'!'.repeat(60)}`);
  for (const f of conflicts.sort()) {
    console.log(`  → ${f}`);
  }
  console.log();
  console.log('How would you like to handle these conflicts?');
  console.log('  [b] Create backups (file.backup_N.ext) and overwrite');
  console.log('  [o] Overwrite all (lose local changes)');
  console.log('  [c] Cancel (make no changes)');
  console.log();

  while (true) {
    const answer = await askQuestion('Choice [b/o/c]: ');
    switch (answer.toLowerCase()) {
      case 'b':
        return 'backup';
      case 'o':
        return 'overwrite';
      case 'c':
        return 'cancel';
      default:
        console.log('Please enter b, o, or c');
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getNextBackupPath(filePath: string): string {
  const dir = dirname(filePath);
  const ext = extname(filePath);
  const base = basename(filePath, ext);

  let n = 1;
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    const backupPattern = new RegExp(`^${escapeRegex(base)}\\.backup_(\\d+)${escapeRegex(ext)}$`);
    for (const file of files) {
      const match = file.match(backupPattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= n) n = num + 1;
      }
    }
  }

  return join(dir, `${base}.backup_${n}${ext}`);
}
