import { describe, expect, it } from 'vitest';
import {
  appearances,
  palettes,
  designTokens,
  fieldStates,
  iconPaths,
  feedback,
  originLabel,
} from '../src/design-system';
import { badge, detailCard, notice } from '../../../apps/browser-fixture/src/components';

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
describe('T-E2E-001-D01 WP-501 design contracts', () => {
  it.each(appearances)('%s maintains text and meaningful non-text contrast', (appearance) => {
    const p = palettes[appearance];
    for (const foreground of [p.text, p.muted, p.accent, p.danger, p.caution, p.success]) {
      for (const background of [p.background, p.surface])
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(p.text, p.selected)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.text, p.land)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accent, p.onAccent)).toBeGreaterThanOrEqual(4.5);
    for (const foreground of [p.border, p.focus, p.route, p.location])
      expect(contrast(foreground, p.surface)).toBeGreaterThanOrEqual(3);
  });
  it('covers the required field and safety states with text and independent geometry', () => {
    const required = [
      'empty',
      'loading',
      'error',
      'stale',
      'gps-degraded',
      'offline',
      'permission-denied',
      'provisioning-expired',
      'activating',
      'rollback',
      'partial-import',
      'insufficient-space',
      'conflict',
      'private-unavailable',
      'rights-excluded',
      'private-origin',
      'closure',
      'unknown',
      'recording',
      'paused',
      'recoverable',
      'low-battery',
      'checkpoint-error',
      'complete',
    ];
    expect(Object.keys(fieldStates).sort()).toEqual(required.sort());
    for (const [key, state] of Object.entries(fieldStates)) {
      expect(state.title.length).toBeGreaterThan(3);
      expect(state.message.length).toBeGreaterThan(20);
      expect(iconPaths[state.icon]).toBeDefined();
      expect(notice(key as keyof typeof fieldStates)).toContain(state.title);
    }
    expect(fieldStates.closure.icon).not.toBe(fieldStates.recording.icon);
    expect(fieldStates.unknown.message).toContain('not permission');
  });
  it('uses bounded original line geometry and field-sized targets', () => {
    expect(designTokens.target.minimum).toBeGreaterThanOrEqual(44);
    for (const paths of Object.values(iconPaths))
      for (const path of paths) {
        expect(path.length).toBeGreaterThanOrEqual(2);
        for (const point of path)
          for (const value of point) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(24);
          }
      }
  });
  it('disables optional motion and haptics without losing event meaning', () => {
    expect(feedback('error', true, false)).toEqual({ durationMs: 0, haptic: null });
    expect(feedback('catalog', false, true).haptic).toBe('success');
    expect(feedback('recording', true, true).durationMs).toBe(0);
  });
  it('never treats unknown or private origins as public, and escapes untrusted details', () => {
    expect(originLabel('new-origin')).toBe('Origin unknown');
    expect(badge('private-catalog')).toContain('Private catalog');
    const attack = '<img src=x onerror="alert(1)">';
    const html = detailCard({
      name: attack,
      origin: 'private-catalog',
      source: attack,
      coverage: attack,
      freshness: attack,
      restrictions: attack,
      uncertainty: attack,
      provenance: attack,
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    for (const label of [
      'Source',
      'Coverage',
      'Freshness',
      'Restrictions',
      'Uncertainty',
      'Provenance',
    ])
      expect(html).toContain(`<dt>${label}</dt>`);
    expect(notice('error', attack)).not.toContain('<img');
  });
});
