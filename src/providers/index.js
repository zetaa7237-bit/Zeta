import fs from 'node:fs/promises';
import { z } from 'zod';
import { providerConfigSchema } from './base-provider.js';
import { AwsProvider } from './aws-provider.js';
import { CloudProvider } from './cloud-provider.js';
import { SoftwareProvider } from './software-provider.js';
import { EntertainmentProvider } from './entertainment-provider.js';
export async function createProviders(filename) {
  const configs = filename ? z.array(providerConfigSchema).max(4).parse(JSON.parse(await fs.readFile(filename, 'utf8'))) : [];
  if (new Set(configs.map(item => item.id)).size !== configs.length) throw new Error('ID provider duplikat.');
  return [AwsProvider, CloudProvider, SoftwareProvider, EntertainmentProvider].map((Provider, index) => new Provider(configs.find(item => item.id === ['aws', 'cloud', 'software', 'entertainment'][index])));
}
