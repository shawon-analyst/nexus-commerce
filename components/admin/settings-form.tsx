'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, Megaphone, Save, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, humanizeError } from '@/lib/utils';
import type { SiteSettings } from '@/lib/site-settings';

/**
 * `/admin/settings` — the shop's prices and copy, without a redeploy.
 *
 * The form is controlled and validates locally for fast feedback, but the route
 * is the authority: it re-validates every field, writes with the caller's own
 * admin session (RLS enforces `is_admin()`), then revalidates the settings tag
 * and the root layout so the storefront picks the new values up immediately.
 *
 * The saved row comes back from the server and re-seeds the fields — so if
 * Postgres normalised a value (a rounded fee), the form shows what is really
 * stored rather than what was typed.
 */
export function SettingsForm({ initialSettings }: { initialSettings: SiteSettings }) {
  const router = useRouter();

  const [inside, setInside] = React.useState(String(initialSettings.insideDhakaCharge));
  const [outside, setOutside] = React.useState(String(initialSettings.outsideDhakaCharge));
  const [bkash, setBkash] = React.useState(initialSettings.bkashNumber);
  const [announcement, setAnnouncement] = React.useState(initialSettings.topAnnouncementText);
  const [announcementEnabled, setAnnouncementEnabled] = React.useState(
    initialSettings.topAnnouncementEnabled,
  );
  const [saving, setSaving] = React.useState(false);

  // Live preview of what a shopper will pay — the same arithmetic the checkout
  // and `place_order()` perform.
  const insidePreview = Number(inside);
  const outsidePreview = Number(outside);

  function applySaved(saved: SiteSettings) {
    setInside(String(saved.insideDhakaCharge));
    setOutside(String(saved.outsideDhakaCharge));
    setBkash(saved.bkashNumber);
    setAnnouncement(saved.topAnnouncementText);
    setAnnouncementEnabled(saved.topAnnouncementEnabled);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();

    const insideValue = Number(inside);
    const outsideValue = Number(outside);

    if (!Number.isFinite(insideValue) || insideValue < 0) {
      toast.error('Enter a valid Inside Dhaka fee', { description: 'Use a number, e.g. 60.' });
      return;
    }
    if (!Number.isFinite(outsideValue) || outsideValue < 0) {
      toast.error('Enter a valid Outside Dhaka fee', { description: 'Use a number, e.g. 120.' });
      return;
    }
    if (bkash.replace(/\D/g, '').length < 10) {
      toast.error('Enter a valid bKash number', {
        description: 'Use the 11-digit wallet, e.g. 01789138295.',
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inside_dhaka_charge: insideValue,
          outside_dhaka_charge: outsideValue,
          bkash_number: bkash,
          top_announcement_text: announcement,
          top_announcement_enabled: announcementEnabled,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string; settings?: SiteSettings }
        | null;

      if (!response.ok || !payload?.settings) {
        toast.error('Could not save the settings', {
          description: humanizeError(payload?.detail ?? payload?.error ?? response.statusText),
        });
        return;
      }

      applySaved(payload.settings);
      toast.success('Settings saved', {
        description: 'The storefront now uses these delivery charges and announcement.',
      });
      // Re-render the admin page with the fresh row, and refresh the client
      // provider so the cart in this tab quotes the new fee too.
      router.refresh();
    } catch (error) {
      toast.error('Could not save the settings', { description: humanizeError(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {/* ------------------------------------------------------- delivery --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" /> Delivery charges
          </CardTitle>
          <CardDescription>
            Charged on every order — there is no free-delivery threshold. The checkout quotes these
            numbers and the database charges the same ones when the order is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="inside-charge">Inside Dhaka delivery fee (৳)</Label>
            <Input
              id="inside-charge"
              type="number"
              inputMode="decimal"
              min={0}
              max={100000}
              step="0.01"
              value={inside}
              onChange={(event) => setInside(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Shoppers see {formatCurrency(Number.isFinite(insidePreview) ? insidePreview : 0)}.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="outside-charge">Outside Dhaka delivery fee (৳)</Label>
            <Input
              id="outside-charge"
              type="number"
              inputMode="decimal"
              min={0}
              max={100000}
              step="0.01"
              value={outside}
              onChange={(event) => setOutside(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Shoppers see {formatCurrency(Number.isFinite(outsidePreview) ? outsidePreview : 0)}.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- bKash --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4" /> bKash wallet
          </CardTitle>
          <CardDescription>
            The number shoppers send money to. Shown on the checkout and in the Terms page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1.5">
          <Label htmlFor="bkash-number">bKash number</Label>
          <Input
            id="bkash-number"
            value={bkash}
            onChange={(event) => setBkash(event.target.value)}
            placeholder="01789138295"
            inputMode="tel"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            required
          />
          <p className="text-xs text-muted-foreground">
            Any local format is accepted (01712 345678, +8801712345678) and stored as 11 digits.
          </p>
        </CardContent>
      </Card>

      {/* -------------------------------------------------- announcement --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" /> Announcement bar
          </CardTitle>
          <CardDescription>
            The scrolling strip above the header. Separate several messages with a vertical bar
            (<code className="rounded bg-muted px-1">|</code>) — each becomes its own ticker segment.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Show the announcement bar</p>
              <p className="text-xs text-muted-foreground">
                When off, the bar is hidden across the whole storefront.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={announcementEnabled}
              aria-label="Show the announcement bar"
              onClick={() => setAnnouncementEnabled((value) => !value)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                announcementEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
                  announcementEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="announcement">Announcement text</Label>
            <Textarea
              id="announcement"
              value={announcement}
              onChange={(event) => setAnnouncement(event.target.value)}
              placeholder="EASY REPLACEMENT GUARANTEE | CASH ON DELIVERY AVAILABLE"
              maxLength={600}
              disabled={!announcementEnabled}
              className="min-h-[90px]"
            />
            <p className="text-xs text-muted-foreground">
              {announcement.length}/600 characters. Leave blank to fall back to the built-in shop
              messages.
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-muted-foreground sm:mr-auto">
          Saving updates the storefront immediately — no redeploy needed.
        </p>
        <Button type="submit" loading={saving} className="sm:w-auto">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
