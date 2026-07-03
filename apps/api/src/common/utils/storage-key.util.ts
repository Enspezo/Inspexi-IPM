/**
 * Sanitise a user-supplied filename before it is embedded in a storage key.
 *
 * Uploads carry a raw `file.originalname` (multer) which an attacker fully
 * controls and can stuff with path separators or `..` sequences to escape the
 * per-org key prefix (path traversal). We keep only the final path segment —
 * splitting on BOTH `/` and `\` so Windows-style paths are handled regardless
 * of the host OS (POSIX `basename` alone ignores `\`) — and neutralise any
 * residual traversal dots so the value can never introduce a new directory
 * level in the key.
 *
 * The `LocalStorageProvider` resolve-guard is the hard backstop; this keeps the
 * stored keys clean (and safe) at the point of construction as well.
 */
export function sanitizeStorageFilename(originalName: string | null | undefined): string {
  const segments = String(originalName ?? '').split(/[/\\]+/);
  const last = segments[segments.length - 1] ?? '';
  const cleaned = last
    .replace(/\.{2,}/g, '.') // collapse `..` (and longer runs) → single dot
    .replace(/^\.+/, '') // drop leading dots (a bare `..`/`.` becomes empty)
    .trim();

  return cleaned.length > 0 ? cleaned : 'bestand';
}

/**
 * Sanitise an extension derived from a user-supplied filename (used by key
 * builders that keep only the extension, e.g. avatars/logos). Returns a safe,
 * separator-free extension without the leading dot; falls back to `bin`.
 */
export function sanitizeStorageExtension(
  originalName: string | null | undefined,
  fallback = 'bin',
): string {
  const name = sanitizeStorageFilename(originalName);
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1) : '';
  const cleaned = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return cleaned.length > 0 ? cleaned : fallback;
}
