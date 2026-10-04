import { createContext, useContext } from 'react';
import { palettes, type Appearance } from '@open-outdoor/shared';

export const AppearanceContext = createContext<Appearance>('light');
export function usePalette() {
  return palettes[useContext(AppearanceContext)];
}
