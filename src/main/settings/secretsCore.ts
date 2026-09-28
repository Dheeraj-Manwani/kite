import type { SecretId } from '../../shared/types';

export interface SecretCipher {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
export interface SecretStorage { read(provider: SecretId): string | undefined; write(provider: SecretId, value: string): void; remove(provider: SecretId): void }
export function createSecrets(cipher: SecretCipher, storage: SecretStorage) {
  const available = () => {
    if (!cipher.isEncryptionAvailable()) throw new Error('OS encryption is unavailable. Kite will not store API keys without encryption.');
  };
  return {
    assertAvailable: available,
    setKey(provider: SecretId, key: string) {
      available();
      if (!key.trim() || key.length > 4096) throw new Error('Enter a valid API key.');
      storage.write(provider, cipher.encryptString(key.trim()).toString('base64'));
    },
    getKey(provider: SecretId): string | undefined {
      available();
      const value = storage.read(provider);
      if (!value) return undefined;
      try { return cipher.decryptString(Buffer.from(value, 'base64')); }
      catch { throw new Error('The saved key cannot be decrypted. Replace it in settings.'); }
    },
    hasKey(provider: SecretId) { return !!storage.read(provider); },
    deleteKey(provider: SecretId) { storage.remove(provider); },
  };
}
