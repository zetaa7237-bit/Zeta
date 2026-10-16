import { BaseProvider } from './base-provider.js';
export class AwsProvider extends BaseProvider {
  constructor(config, request) { super('aws', config, request); }
}
