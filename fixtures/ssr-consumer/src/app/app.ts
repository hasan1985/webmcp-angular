import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {declareWebMcpTool, isWebMcpSupported} from 'webmcp-angular';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>SSR consumer fixture</h1>
    <p id="supported">webmcp-supported: {{ supported() }}</p>
  `,
})
export class App {
  // Called in a constructor that runs on the server too.
  protected readonly supported = signal(isWebMcpSupported());

  constructor() {
    declareWebMcpTool({
      name: 'ssr_component_smoke',
      description: 'Declared from a component constructor, which also runs server-side.',
      inputSchema: {type: 'object', properties: {}},
      execute: () => inject(ComponentOnlyMarker).value,
    });
  }
}

class ComponentOnlyMarker {
  readonly value = 'client only';
}
