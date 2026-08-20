export type StoreKind = 'writable-user' | 'readonly-catalog';

export interface StoreDescriptor {
  readonly kind: StoreKind;
  readonly schemaVersion: number;
}
