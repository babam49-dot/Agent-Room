export interface SandboxExecOptions {
  cwd?: string;
  timeoutSec: number;
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

export interface SandboxFileEntry {
  name: string;
  type: 'file' | 'dir';
  size: number;
}

export interface Sandbox {
  exec(cmd: string, o: SandboxExecOptions): Promise<{ exitCode: number }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  list(path: string): Promise<SandboxFileEntry[]>;
  destroy(): Promise<void>;
}

export class FakeSandbox implements Sandbox {
  private files: Map<string, string> = new Map();
  private commandOutputs: Map<string, { exitCode: number; stdout: string; stderr: string }> = new Map();

  constructor() {
    // Seed initial files for the Payments service
    this.files.set(
      'src/routes/charge.ts',
      `// Legacy charge endpoint\nexport async function handleCharge(req: any, res: any) {\n  const { token, amount } = req.body;\n  console.log('Processing charge for amount:', amount);\n  return res.json({ success: true, id: 'ch_legacy_123' });\n}\n`
    );
    this.files.set(
      'package.json',
      JSON.stringify({ name: 'payments-service', version: '1.0.0', scripts: { test: 'vitest run' } }, null, 2)
    );
  }

  setCommandOutput(cmdRegexOrExact: string, output: { exitCode: number; stdout: string; stderr?: string }) {
    this.commandOutputs.set(cmdRegexOrExact, {
      exitCode: output.exitCode,
      stdout: output.stdout,
      stderr: output.stderr || '',
    });
  }

  async exec(cmd: string, o: SandboxExecOptions): Promise<{ exitCode: number }> {
    // Match scripted outputs
    for (const [key, val] of this.commandOutputs.entries()) {
      if (cmd.includes(key) || new RegExp(key).test(cmd)) {
        if (val.stdout && o.onOutput) o.onOutput('stdout', val.stdout);
        if (val.stderr && o.onOutput) o.onOutput('stderr', val.stderr);
        return { exitCode: val.exitCode };
      }
    }

    // Default built-in mock behavior for standard commands
    if (cmd.startsWith('pnpm test') || cmd.startsWith('npm test')) {
      const out = '✓ src/routes/paymentsV2.test.ts (4 tests passed)\nTest Files 1 passed (1)\nTests 4 passed (4)\n';
      if (o.onOutput) o.onOutput('stdout', out);
      return { exitCode: 0 };
    }

    if (cmd === 'git status') {
      const out = 'On branch main\nChanges not staged for commit:\n\tmodified: src/routes/charge.ts\nUntracked files:\n\tsrc/routes/paymentsV2.ts\n';
      if (o.onOutput) o.onOutput('stdout', out);
      return { exitCode: 0 };
    }

    if (o.onOutput) o.onOutput('stdout', `[FakeSandbox] Executed: ${cmd}\n`);
    return { exitCode: 0 };
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`File not found in sandbox: ${path}`);
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async list(path: string): Promise<SandboxFileEntry[]> {
    const entries: SandboxFileEntry[] = [];
    for (const [filePath, content] of this.files.entries()) {
      if (filePath.startsWith(path)) {
        entries.push({
          name: filePath.slice(path.length).replace(/^\//, ''),
          type: 'file',
          size: content.length,
        });
      }
    }
    return entries;
  }

  async destroy(): Promise<void> {
    this.files.clear();
  }
}
