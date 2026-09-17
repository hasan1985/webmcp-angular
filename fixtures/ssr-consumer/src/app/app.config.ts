import {ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection} from '@angular/core';
import {provideWebMcpTools} from 'webmcp-angular';
import {webMcpTool} from 'webmcp-angular/strict';

// Uses the /strict secondary entry point on purpose. It imports its types from the
// primary entry BY PACKAGE NAME, which silently degrades to `any` under a symlinked
// (`file:`) install — see docs/history/M0-FINDINGS.md §6.1. The `toFixed` below only
// compiles if `count` really is inferred as a number, so this file fails the build
// if that regression ever comes back.
const echoCount = webMcpTool({
  name: 'ssr_echo_count',
  description: 'Must not register during a server render.',
  inputSchema: {
    type: 'object',
    properties: {count: {type: 'integer'}},
    required: ['count'],
  },
  execute: ({count}) => count.toFixed(0),
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideWebMcpTools([echoCount]),
  ],
};
