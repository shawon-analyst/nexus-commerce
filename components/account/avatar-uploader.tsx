'use client';

import * as React from 'react';
import { Camera, Check, ImagePlus, Link2, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/ui/user-avatar';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/utils';
import type { Profile } from '@/lib/types';

/** Kept in sync with the `avatars` bucket limits in the SQL migrations. */
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
const STORAGE_MARKER = '/storage/v1/object/public/avatars/';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

function extensionFor(file: File) {
  const fromMime = EXTENSION_BY_TYPE[file.type];
  if (fromMime) return fromMime;
  const fromName = file.name.split('.').pop()?.toLowerCase();
  return fromName && /^[a-z0-9]{2,5}$/.test(fromName) ? fromName : 'png';
}

/**
 * Returns the in-bucket object path when `url` points at the avatars bucket and
 * belongs to this user, else `null`. Google-hosted avatars and arbitrary pasted
 * links deliberately return `null`: we must never try to delete them.
 */
function ownedStoragePath(url: string | null | undefined, userId: string) {
  if (!url) return null;
  const index = url.indexOf(STORAGE_MARKER);
  if (index === -1) return null;
  const path = decodeURIComponent(url.slice(index + STORAGE_MARKER.length).split('?')[0]);
  return path.startsWith(`${userId}/`) ? path : null;
}

export function AvatarUploader({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: (profile: Profile) => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [urlPanelOpen, setUrlPanelOpen] = React.useState(false);
  const [urlDraft, setUrlDraft] = React.useState('');
  const [savingUrl, setSavingUrl] = React.useState(false);

  /**
   * Writes `avatar_url` and hands the fresh row back to the dashboard.
   *
   * `.select('*').maybeSingle()` answers *no row and no error* when the update
   * matched nothing — which is exactly what a policy refusal looks like from
   * here. Reporting that as success would tell the shopper "photo updated" while
   * the database kept the old value, so it is raised instead.
   */
  async function persistAvatar(avatarUrl: string | null) {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', profile.id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('PROFILE_UPDATE_FORBIDDEN');
    onUpdated(data);
    return data;
  }

  /** Best-effort tidy-up: drop the file we just replaced from the bucket. */
  async function discardStoredAvatar(previousUrl: string | null | undefined) {
    const path = ownedStoragePath(previousUrl, profile.id);
    if (!path) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.storage.from('avatars').remove([path]);
  }

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported image', { description: 'Use a PNG, JPEG, WEBP, AVIF or GIF.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image is too large', { description: 'Keep it under 2 MB.' });
      return;
    }

    setUploading(true);
    const previousUrl = profile.avatar_url;
    const supabase = getSupabaseBrowserClient();
    // Tracked so a row-write failure can take the orphaned upload back out.
    let uploadedPath: string | null = null;
    try {
      // One folder per user — the Storage policy only allows writes inside it.
      const path = `${profile.id}/avatar-${Date.now()}.${extensionFor(file)}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;
      uploadedPath = path;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path);

      await persistAvatar(publicUrl);
      uploadedPath = null; // the row points at it now, so it is no longer an orphan
      void discardStoredAvatar(previousUrl);

      toast.success('Profile photo updated', {
        description: 'Your new picture is now live across the site.',
      });
    } catch (error) {
      // The bytes reached the bucket but the row did not: drop the file again
      // rather than leave an object nothing points at.
      if (uploadedPath) void supabase.storage.from('avatars').remove([uploadedPath]);
      toast.error('Could not upload the photo', { description: humanizeError(error) });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      // Clear the reference *first*. If the bucket delete then fails the worst
      // case is an orphaned file, not a profile pointing at a deleted one.
      await persistAvatar(null);
      await discardStoredAvatar(profile.avatar_url);
      toast.success('Profile photo removed', {
        description: 'Your initials are shown instead.',
      });
    } catch (error) {
      toast.error('Could not remove the photo', { description: humanizeError(error) });
    } finally {
      setRemoving(false);
    }
  }

  async function handleSaveUrl(event: React.FormEvent) {
    event.preventDefault();
    const next = urlDraft.trim();
    if (!next) {
      toast.error('Paste an image URL first');
      return;
    }
    try {
      const parsed = new URL(next);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('bad protocol');
    } catch {
      toast.error('That does not look like an image URL');
      return;
    }

    setSavingUrl(true);
    try {
      await persistAvatar(next);
      setUrlPanelOpen(false);
      setUrlDraft('');
      toast.success('Profile photo updated');
    } catch (error) {
      toast.error('Could not save the URL', { description: humanizeError(error) });
    } finally {
      setSavingUrl(false);
    }
  }

  const busy = uploading || removing;

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative">
        <UserAvatar
          src={profile.avatar_url}
          name={profile.full_name}
          email={profile.email}
          className="h-24 w-24 text-2xl ring-2 ring-background"
          sizes="96px"
          forceInitials={uploading}
        />
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Change profile photo"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full border shadow-md"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset first so picking the same file twice still fires onChange.
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      <div className="space-y-1">
        <p className="text-sm font-semibold">
          {profile.full_name?.trim() || profile.email}
        </p>
        <p className="text-xs text-muted-foreground">PNG, JPG, WEBP or GIF · up to 2 MB</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-3.5 w-3.5" /> Upload photo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setUrlDraft(profile.avatar_url?.startsWith('http') ? profile.avatar_url : '');
            setUrlPanelOpen((open) => !open);
          }}
        >
          <Link2 className="h-3.5 w-3.5" /> Use a URL
        </Button>
        {profile.avatar_url && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void handleRemove()}
            className="text-destructive hover:text-destructive"
          >
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Remove
          </Button>
        )}
      </div>

      {urlPanelOpen && (
        <form onSubmit={handleSaveUrl} className="w-full animate-fade-in space-y-2 text-left">
          <Label htmlFor="avatar-url" className="text-xs">
            Image URL
          </Label>
          <Input
            id="avatar-url"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="https://example.com/me.jpg"
            inputMode="url"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setUrlPanelOpen(false)}
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button type="submit" size="sm" loading={savingUrl}>
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
