import { BaseProvider } from './base-provider.js';
// Hanya untuk tes/demo eksplisit; tidak diregistrasikan pada startup produksi.
export class MockProvider extends BaseProvider {
  constructor(offers = []) { super('mock'); this.offers = offers; }
  isConfigured() { return true; }
  async searchOffers() { return structuredClone(this.offers); }
}
