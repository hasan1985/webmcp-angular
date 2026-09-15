import {
  declareExperimentalWebMcpTool,
  provideExperimentalWebMcpTools,
} from '../../projects/webmcp-angular/src/public-api';
import {runParitySuite} from '../shared/parity-suite';

runParitySuite(`webmcp-angular @ Angular ${process.env['NG_LABEL'] ?? '?'}`, {
  declareExperimentalWebMcpTool,
  provideExperimentalWebMcpTools,
});
