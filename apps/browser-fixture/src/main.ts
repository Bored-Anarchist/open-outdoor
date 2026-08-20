import { assertCoordinate } from '@open-outdoor/shared';

const app = document.querySelector<HTMLElement>('#app');
if (app) app.textContent = `Synthetic fixture: ${assertCoordinate([-74, 41]).join(', ')}`;
