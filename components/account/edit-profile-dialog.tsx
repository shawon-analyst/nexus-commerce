'use client';

import * as React from 'react';
import { PencilLine, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NO_EMAIL_LABEL, displayEmail } from '@/lib/identity';
import { normalizeBdPhone } from '@/lib/phone';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/utils';
import type { Profile } from '@/lib/types';

export function EditProfileDialog({
  profile,
  onUpdated,
  trigger,
}: {
  profile: Profile;
  onUpdated: (profile: Profile) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [fullName, setFullName] = React.useState(profile.full_name ?? '');
  const [phone, setPhone] = React.useState(profile.phone ?? '');
  const [shippingAddress, setShippingAddress] = React.useState(profile.shipping_address ?? '');
  const [saving, setSaving] = React.useState(false);

  // Re-seed the fields each time the dialog opens so a cancelled edit is
  // discarded instead of silently lingering.
  function handleOpenChange(next: boolean) {
    if (next) {
      setFullName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
      setShippingAddress(profile.shipping_address ?? '');
    }
    setOpen(next);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fullName.trim()) {
      toast.error('Please enter your name');
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();

      /*
       * Store the mobile number in its canonical `01XXXXXXXXX` form whenever it
       * parses as one. That is what makes phone sign-in and phone-based password
       * recovery able to find the account by number (`lib/phone-lookup.ts`) — the
       * field used to be free text, so `+8801712…` and `01712…` were two
       * different strings for the same person. Anything that is not a Bangladeshi
       * mobile number (a landline, a foreign number) is kept as typed.
       */
      const trimmedPhone = phone.trim();
      const canonicalPhone = normalizeBdPhone(trimmedPhone);

      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: canonicalPhone ?? (trimmedPhone || null),
          shipping_address: shippingAddress.trim() || null,
        })
        .eq('id', profile.id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('PROFILE_UPDATE_FORBIDDEN');

      onUpdated(data);
      setOpen(false);
      toast.success('Profile updated', {
        description: 'Your details are used to prefill the checkout form.',
      });
    } catch (error) {
      toast.error('Could not save your profile', { description: humanizeError(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <PencilLine className="h-3.5 w-3.5" /> Edit profile
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Keep this up to date — the name, phone and address below are offered as a prefill at
            checkout.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              value={displayEmail(profile.email) ?? NO_EMAIL_LABEL}
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              Managed under <strong className="font-medium text-foreground">Recovery email</strong>{' '}
              on your profile — that is where reset links are sent.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="profile-phone">Phone number</Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+880 1789 138295"
              autoComplete="tel"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="profile-address">Delivery address</Label>
            <Textarea
              id="profile-address"
              value={shippingAddress}
              onChange={(event) => setShippingAddress(event.target.value)}
              placeholder="House 12, Road 5, Dhanmondi, Dhaka 1205"
              autoComplete="street-address"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <Save className="h-3.5 w-3.5" /> Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
