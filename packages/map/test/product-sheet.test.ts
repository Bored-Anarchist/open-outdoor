import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { palettes } from '@open-outdoor/shared';

vi.mock('../../../apps/mobile/node_modules/react-native', () => ({
  View: 'view',
  ScrollView: 'scroll',
  Modal: 'modal',
  KeyboardAvoidingView: 'keyboard-avoid',
  Platform: { OS: 'ios' },
}));
vi.mock('../../../apps/mobile/node_modules/react-native-safe-area-context', () => ({
  SafeAreaView: 'safe-area',
}));
vi.mock('../../../apps/mobile/ProductComponents', () => ({
  ProductHeader: 'header',
  usePalette: () => palettes.light,
}));
import { ProductSheet } from '../../../apps/mobile/ProductSheet';

it('opens each shared-sheet page at the top while preserving scroll during edits', async () => {
  let offset = 0;
  const onClose = vi.fn();
  const page = (title: string, visible = true, children = 'Synthetic page') =>
    createElement(ProductSheet, { title, visible, onClose, children });
  let root!: ReturnType<typeof create>;
  try {
    await act(async () => {
      root = create(page('Place details'), {
        createNodeMock: ({ type }) =>
          type === 'scroll'
            ? {
                scrollTo: ({ y }: { y: number }) => {
                  offset = y;
                },
              }
            : null,
      });
    });
    const modal = root.root.findByType('modal');
    offset = 700;
    await act(async () => root.update(page('Place note')));
    expect(root.root.findByType('modal')).toBe(modal);
    expect(offset).toBe(0);
    offset = 400;
    await act(async () => root.update(page('Place note', true, 'Edited note')));
    expect(offset).toBe(400);
    await act(async () => root.update(page('Place note', false)));
    await act(async () => root.update(page('Place note')));
    expect(offset).toBe(0);
  } finally {
    await act(async () => root.unmount());
  }
});
