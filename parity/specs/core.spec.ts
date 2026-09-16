import {
  declareExperimentalWebMcpTool,
  provideExperimentalWebMcpTools,
} from '@angular/core';
import {runParitySuite} from '../shared/parity-suite';

// The reference implementation. Angular 22 only.
runParitySuite('@angular/core v22 (reference)', {
  declareTool: declareExperimentalWebMcpTool,
  provideTools: provideExperimentalWebMcpTools,
});
