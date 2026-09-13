import { readFile } from 'node:fs/promises';
import { sealRelease, verifyRelease } from './release-artifacts-lib.mjs';
const [command, directory, inputPath] = process.argv.slice(2);
try {
  if (
    !['seal', 'verify'].includes(command) ||
    !directory ||
    !inputPath ||
    process.argv.length !== 5
  )
    throw new Error(
      'Usage: node tools/release-artifacts.mjs seal|verify DIRECTORY DESCRIPTOR_OR_POLICY.json',
    );
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  if (command === 'verify')
    console.log(JSON.stringify(await verifyRelease(directory, input), null, 2));
  else {
    if (!process.env.OPEN_OUTDOOR_RELEASE_KEY_FILE)
      throw new Error('External OPEN_OUTDOOR_RELEASE_KEY_FILE required');
    await sealRelease(
      directory,
      input,
      await readFile(process.env.OPEN_OUTDOOR_RELEASE_KEY_FILE, 'utf8'),
    );
    console.log('Release envelope sealed; run independent verification before publication.');
  }
} catch (error) {
  console.error(`Release verification failed: ${error.code ?? error.message}`);
  process.exitCode = 1;
}
