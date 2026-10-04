import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test(
  'laptop failures preserve their messages through the installed Expo error bridge',
  {
    skip: process.platform !== 'darwin' && 'Native Swift regression runs on the iOS build host',
  },
  async () => {
    const require = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
    const expoRequire = createRequire(require.resolve('expo/package.json'));
    const core = dirname(expoRequire.resolve('expo-modules-core/package.json'));
    const coreRequire = createRequire(join(core, 'package.json'));
    const jsi = dirname(coreRequire.resolve('expo-modules-jsi/package.json'));
    const directory = await mkdtemp(join(tmpdir(), 'open-outdoor-errors-'));
    try {
      // Compile the installed SDK's actual exception and protocol definitions, not a mock bridge.
      const sources = [
        join(jsi, 'apple/Sources/ExpoModulesJSI/Protocols/JavaScriptThrowable.swift'),
        ...['CodedError', 'ChainableException', 'ExceptionOrigin', 'Exception'].map((name) =>
          join(core, `ios/Core/Exceptions/${name}.swift`),
        ),
        resolve('packages/native-spikes/ios/OpenOutdoorLaptopException.swift'),
      ];
      const source = (await Promise.all(sources.map((file) => readFile(file, 'utf8')))).join('\n');
      await writeFile(
        join(directory, 'Errors.swift'),
        source.replace(/^import ExpoModulesCore\r?\n/gm, ''),
      );
      const binary = join(directory, 'error-tests');
      const build = spawnSync(
        'swiftc',
        [
          join(directory, 'Errors.swift'),
          resolve('tools/laptop/laptop-error-native-tests.swift'),
          '-o',
          binary,
        ],
        { encoding: 'utf8' },
      );
      assert.equal(build.status, 0, build.stderr);
      const result = spawnSync(binary, [], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Native laptop error bridge passed/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
