import { useState, useRef } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Card, Button, Spinner, useToast } from '@/components/ui';
import { useUploadAvatar, useDeleteAvatar, getAvatarUrl } from '../hooks/use-avatar';

// ─── Avatar Card Component ──────────────────────────────

export function AvatarCard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const uploadMutation = useUploadAvatar();
  const deleteMutation = useDeleteAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarCacheBust, setAvatarCacheBust] = useState(() => Date.now());
  const hasAvatar = Boolean(user?.avatarUrl);
  const avatarUrl = getAvatarUrl();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Alleen PNG, JPEG en WebP zijn toegestaan', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Bestand mag maximaal 5 MB zijn', 'error');
      return;
    }

    try {
      await uploadMutation.mutateAsync(file);
      setAvatarCacheBust(Date.now());
      refreshUser();
      showToast('Avatar geüpload', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      setAvatarCacheBust(Date.now());
      refreshUser();
      showToast('Avatar verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '';

  return (
    <Card title="Profielfoto">
      <div className="flex items-center gap-6">
        {/* Avatar preview */}
        <div className="shrink-0">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100">
            {uploadMutation.isPending ? (
              <Spinner size="md" />
            ) : hasAvatar ? (
              <img
                src={`${avatarUrl}?v=${avatarCacheBust}`}
                alt="Profielfoto"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="text-xl font-semibold text-gray-500">
                {initials}
              </span>
            )}
          </div>
        </div>

        {/* Upload zone */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm text-gray-500">
              Upload een profielfoto in PNG, JPEG of WebP formaat (max 5 MB).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              isLoading={uploadMutation.isPending}
            >
              {hasAvatar ? 'Foto wijzigen' : 'Foto uploaden'}
            </Button>
            {hasAvatar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                isLoading={deleteMutation.isPending}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Verwijderen
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </Card>
  );
}
