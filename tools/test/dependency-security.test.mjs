import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const mobile = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
const expo = createRequire(mobile.resolve('expo/package.json'));
const cli = createRequire(expo.resolve('@expo/cli/package.json'));
const forge = cli('node-forge');

test('Expo forge rejects unconsumed nested RSA digest fields and accepts standard signatures', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 1024, publicExponent: 3 });
  const privateKey = forge.pki.privateKeyFromPem(
    pair.privateKey.export({ format: 'pem', type: 'pkcs1' }),
  );
  const publicKey = forge.pki.publicKeyFromPem(
    pair.publicKey.export({ format: 'pem', type: 'pkcs1' }),
  );
  const digest = forge.md.sha256.create().update('synthetic dependency regression');
  const hash = digest.digest().getBytes();
  const { asn1 } = forge;
  const item = (type, value, constructed = false) =>
    asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const oid = item(asn1.Type.OID, asn1.oidToDer(forge.pki.oids.sha256).getBytes());
  for (const parameters of [[], [item(asn1.Type.NULL, '')]]) {
    for (const extra of [[], [item(asn1.Type.OCTETSTRING, 'unconsumed')]]) {
      const info = item(
        asn1.Type.SEQUENCE,
        [
          item(asn1.Type.SEQUENCE, [oid, ...parameters, ...extra], true),
          item(asn1.Type.OCTETSTRING, hash),
        ],
        true,
      );
      const signature = privateKey.sign(asn1.toDer(info).getBytes(), 'NONE');
      if (extra.length) assert.throws(() => publicKey.verify(hash, signature), /DigestInfo/);
      else assert.equal(publicKey.verify(hash, signature), true);
    }
  }
  assert.equal(publicKey.verify(hash, privateKey.sign(digest)), true);
});

const zodDirectory = dirname(cli.resolve('zod/package.json'));
for (const [api, mode] of [
  ['v3', 'require'],
  ['v3', 'import'],
  ['v4', 'require'],
  ['v4', 'import'],
]) {
  const z =
    mode === 'require'
      ? cli(`zod/${api}`)
      : await import(pathToFileURL(join(zodDirectory, api, 'index.js')));
  for (const container of ['array', 'exact-array', 'set', ...(api === 'v4' ? ['map'] : [])]) {
    test(`Expo Zod ${api} ${mode} bounds ${container} before parsing elements (sync and async)`, async () => {
      let walked = 0;
      let refined = 0;
      const element = z.any().transform((value) => {
        walked++;
        return value;
      });
      const schema = (
        container === 'array'
          ? z.array(element).max(2)
          : container === 'exact-array'
            ? z.array(element).length(2)
            : container === 'set'
              ? z.set(element).max(2)
              : z.map(element, element).check(z.maxSize(2))
      ).refine(() => {
        refined++;
        return true;
      });
      const oversized =
        container === 'map'
          ? new Map([
              [1, 1],
              [2, 2],
              [3, 3],
            ])
          : container === 'set'
            ? new Set([1, 2, 3])
            : [1, 2, 3];
      for (const result of [schema.safeParse(oversized), await schema.safeParseAsync(oversized)]) {
        assert.equal(result.success, false);
        assert.equal(result.error.issues.length, 1);
        assert.equal(result.error.issues[0].code, 'too_big');
      }
      assert.equal(walked, 0);
      assert.equal(refined, 0);
      const valid =
        container === 'map'
          ? new Map([
              [1, 1],
              [2, 2],
            ])
          : container === 'set'
            ? new Set([1, 2])
            : [1, 2];
      assert.deepEqual(schema.parse(valid), valid);
      assert(walked > 0);
      assert.equal(refined, 1);
    });
  }
  test(`Expo Zod ${api} ${mode} caps invalid-element diagnostics and retains nested paths`, () => {
    const result = z
      .object({ values: z.array(z.string()).max(2) })
      .safeParse({ values: Array(4096).fill(1) });
    assert.equal(result.success, false);
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, 'too_big');
    assert.deepEqual(result.error.issues[0].path, ['values']);
    assert.equal(z.array(z.string()).max(2).safeParse(['valid']).success, true);
    assert.equal(z.array(z.string()).max(2).safeParse([1]).success, false);
    // Recovery must still run validation on its fallback value.
    assert.equal(
      z
        .array(z.string())
        .max(2)
        .catch([])
        .refine(() => false)
        .safeParse(['a', 'b', 'c']).success,
      false,
    );
  });
  if (api === 'v4')
    test(`Expo Zod ${mode} preserves an overwrite before a collection bound`, () => {
      assert.deepEqual(
        z
          .array(z.number())
          .overwrite((values) => values.slice(0, 2))
          .max(2)
          .parse([1, 2, 3]),
        [1, 2],
      );
    });
}
