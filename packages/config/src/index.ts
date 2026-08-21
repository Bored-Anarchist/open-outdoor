export type ReleaseChannel = 'public' | 'local' | 'private';

export interface ChannelIdentity {
  readonly appName: string;
  readonly bundleIdentifier: string;
  readonly trustRoot: string;
}

export * from './catalog-trust.js';
