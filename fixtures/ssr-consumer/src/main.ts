import {bootstrapApplication} from '@angular/platform-browser';
import {installWebMcpPolyfill} from 'webmcp-angular/polyfill';

import {App} from './app/app';
import {appConfig} from './app/app.config';

// Exercises the /polyfill entry point's resolution from a consumer. It no-ops on
// the server and resolves to 'unavailable' when the optional peer is absent, so it
// is safe here even though this fixture does not install @mcp-b/webmcp-polyfill.
installWebMcpPolyfill()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
