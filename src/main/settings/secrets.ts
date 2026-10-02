import { safeStorage } from 'electron';
import Store from 'electron-store';
import { createSecrets } from './secretsCore';
import type { SecretId } from '../../shared/types';

/** The OS's encryption (DPAPI on Windows), for API keys and memory values. Linux's plain-text fallback doesn't count. */
export const osCipher = {
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable() && !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'),
  encryptString: (value: string) => safeStorage.encryptString(value),
  decryptString: (value: Buffer) => safeStorage.decryptString(value),
};
export function openSecrets() {
  const store = new Store<{ secrets: Partial<Record<SecretId, string>> }>({ name: 'settings', defaults: { secrets: {} } });
  return createSecrets(osCipher, {
    read: provider => store.get('secrets')[provider],
    write: (provider, value) => store.set('secrets', { ...store.get('secrets'), [provider]: value }),
    remove: provider => { const secrets = { ...store.get('secrets') }; delete secrets[provider]; store.set('secrets', secrets); },
  });
}
