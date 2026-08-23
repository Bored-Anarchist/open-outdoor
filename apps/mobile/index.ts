import { registerRootComponent } from 'expo';
import { createElement } from 'react';
import App from './App';
import { StartupErrorBoundary } from './StartupErrorBoundary';

function OpenOutdoorRoot() {
  return createElement(StartupErrorBoundary, null, createElement(App));
}

registerRootComponent(OpenOutdoorRoot);
