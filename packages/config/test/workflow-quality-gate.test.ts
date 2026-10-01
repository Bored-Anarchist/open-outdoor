import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(
  readFileSync(new URL('../../../.github/workflows/windows-quality.yml', import.meta.url), 'utf8'),
);
const gate = workflow.jobs.quality;
const bash =
  process.platform === 'win32'
    ? join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe')
    : 'bash';

describe('quality workflow final status', () => {
  it('publishes exactly one stable status after both routing and Windows checks complete', () => {
    expect(gate.name).toBe('windows-quality');
    expect(gate.needs).toEqual(['route', 'windows-shared']);
    expect(gate.if).toBe('always()');
    expect(
      Object.values(workflow.jobs).filter(
        (job: unknown) => (job as { name: string }).name === 'windows-quality',
      ),
    ).toHaveLength(1);
    expect(gate.steps[0].env).toEqual({
      ROUTE_RESULT: '${{ needs.route.result }}',
      RUN_EXPENSIVE: '${{ needs.route.outputs.run_expensive }}',
      QUALITY_RESULT: '${{ needs.windows-shared.result }}',
    });
  });

  it.each([
    ['success', 'true', 'success', true],
    ['success', 'true', 'failure', false],
    ['success', 'true', 'cancelled', false],
    ['success', 'true', 'skipped', false],
    ['success', 'false', 'skipped', true],
    ['success', 'false', 'failure', false],
    ['success', 'false', 'success', false],
    ['success', '', 'skipped', false],
    ['failure', 'false', 'skipped', false],
    ['failure', 'true', 'success', false],
    ['cancelled', 'false', 'skipped', false],
    ['skipped', '', 'skipped', false],
  ])('evaluates route=%s, expensive=%s, quality=%s', (route, expensive, quality, passes) => {
    const result = spawnSync(bash, ['--noprofile', '--norc', '-c', gate.steps[0].run], {
      env: {
        ...process.env,
        ROUTE_RESULT: route,
        RUN_EXPENSIVE: expensive,
        QUALITY_RESULT: quality,
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status === 0).toBe(passes);
  });
});
