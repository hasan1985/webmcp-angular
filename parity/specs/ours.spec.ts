import {
  declareExperimentalWebMcpTool,
  provideExperimentalWebMcpTools,
} from '../../projects/ng-webmcp-compat/src/public-api';
import {runParitySuite} from '../shared/parity-suite';

runParitySuite(`ng-webmcp-compat @ Angular ${process.env['NG_LABEL'] ?? '?'}`, {
  declareExperimentalWebMcpTool,
  provideExperimentalWebMcpTools,
});
