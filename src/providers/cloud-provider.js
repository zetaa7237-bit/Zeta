import { BaseProvider } from './base-provider.js';
export class CloudProvider extends BaseProvider {
  constructor(config, request) { super('cloud', config, request); }
}
