import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function prohibitedPackageFiles(paths) {
  return paths.filter(
    (path) =>
      /^(?:PrivateData\/|\.tmp-public-agency\/)/i.test(path) ||
      /^packages\/map\/src\/assets\/state-packages\/US\/[A-Z]{2}\/(?:outdoors\.geojson|index\.json|state\.sqlite|parts\/)/.test(
        path,
      ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const blocked = prohibitedPackageFiles(files);
  if (blocked.length) {
    console.error(`Generated/private datasets must remain outside Git:\n${blocked.join('\n')}`);
    process.exitCode = 1;
  } else
    console.log('Package storage policy passed: recipes and metadata only for full state packages');
}
