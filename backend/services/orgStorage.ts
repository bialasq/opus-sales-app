import { getStorage, type StorageProvider } from "./storage";

/**
 * Nakładka na istniejący StorageProvider, która IZOLUJE pliki per-organizacja.
 * Każdy klucz jest automatycznie prefiksowany `org_{id}/`, więc organizacja A
 * fizycznie nie jest w stanie odwołać się do pliku organizacji B — nawet gdyby
 * podała cudzą nazwę pliku. To domyka izolację na poziomie storage,
 * niezależnie od kontroli w bazie danych (obrona w głąb).
 *
 * Użycie w trasie:
 *   const store = orgStorage(req.auth.organizationId);
 *   await store.getFile(file.storageKey);
 */
export function orgStorage(organizationId: string): StorageProvider {
  if (!organizationId || /[^A-Za-z0-9_-]/.test(organizationId)) {
    throw new Error("Nieprawidłowy organizationId dla storage");
  }
  const base = getStorage();
  const prefix = `org_${organizationId}`;

  const withPrefix = (key: string): string => {
    // Klucz nie może próbować wyjść z kontenera organizacji.
    if (key.includes("/") || key.includes("\\") || key.includes("..")) {
      throw new Error(`Niedozwolony klucz storage: ${key}`);
    }
    return `${prefix}/${key}`;
  };

  return {
    putFile: (key, content) => base.putFile(withPrefix(key), content),
    getFile: (key) => base.getFile(withPrefix(key)),
    deleteFile: (key) => base.deleteFile(withPrefix(key)),
    getMetadata: (key) => base.getMetadata(withPrefix(key)),
    listFiles: (sub = "") => base.listFiles(`${prefix}/${sub}`),
    getSignedDownloadUrl: base.getSignedDownloadUrl
      ? (key, ttl) => base.getSignedDownloadUrl!(withPrefix(key), ttl)
      : undefined,
  };
}
