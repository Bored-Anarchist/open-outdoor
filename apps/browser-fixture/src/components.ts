import type { DetailPresentation } from '@open-outdoor/shared';
import {
  fieldStates,
  iconPaths,
  originLabel,
  type FieldState,
  type IconName,
} from '@open-outdoor/shared';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}
export function icon(name: IconName): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name].map((path) => `<polyline points="${path.map((point) => point.join(',')).join(' ')}"/>`).join('')}</svg>`;
}
export function notice(state: FieldState, detail?: string): string {
  const item = fieldStates[state];
  return `<article class="notice tone-${item.tone}" data-state="${state}"><h3>${icon(item.icon)}${escapeHtml(item.title)}</h3><p>${escapeHtml(detail ?? item.message)}</p></article>`;
}
export function badge(origin: string): string {
  return `<span class="badge">${icon(origin === 'public-catalog' ? 'info' : 'private')}${escapeHtml(originLabel(origin))}</span>`;
}
export function button(label: string, attributes = '', iconName?: IconName): string {
  return `<button type="button" ${attributes}>${iconName ? icon(iconName) : ''}${escapeHtml(label)}</button>`;
}

export function detailCard(detail: DetailPresentation): string {
  return `<article class="card"><h2>${escapeHtml(detail.name)}</h2>${badge(detail.origin)}<dl>${(['source', 'coverage', 'freshness', 'restrictions', 'uncertainty', 'provenance'] as const).map((key) => `<div><dt>${key[0]!.toUpperCase() + key.slice(1)}</dt><dd>${escapeHtml(detail[key])}</dd></div>`).join('')}</dl></article>`;
}
