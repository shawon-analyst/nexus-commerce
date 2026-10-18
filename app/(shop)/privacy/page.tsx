import type { Metadata } from 'next';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page';
import { DATA_DELETION_ANCHOR } from '@/lib/legal';
import { OG_IMAGE, SITE_NAME, absoluteUrl, openGraphDefaults } from '@/lib/seo';
import { SHOP_ADDRESS, SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/utils';

const TITLE = 'Privacy Policy';
const DESCRIPTION = `How ${SITE_NAME} collects, uses, shares and deletes your personal data — including how to delete your account and the data linked to it.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/privacy' },
  openGraph: {
    ...openGraphDefaults,
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/privacy'),
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title={TITLE}
      path="/privacy"
      summary={`${SITE_NAME} is a Bangladesh-based online store. This policy explains, in plain language, what we collect when you browse or buy, why we need it, who we share it with, and how you can get it deleted.`}
    >
      {/* The anchor is also surfaced at the top: Meta's review checklist looks
          for a deletion route, and a shopper should not have to hunt for it. */}
      <aside className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Want your account and personal data removed? Jump straight to{' '}
            <a
              href={`#${DATA_DELETION_ANCHOR}`}
              className="font-medium text-foreground underline underline-offset-2"
            >
              How to delete your data
            </a>
            .
          </p>
        </div>
        <Link
          href="/account"
          prefetch
          className="shrink-0 text-sm font-medium text-foreground underline underline-offset-2"
        >
          Open my account
        </Link>
      </aside>

      <LegalSection id="who-we-are" title="1. Who is responsible for your data">
        <p>
          {SITE_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates this storefront and decides how
          and why personal data is processed. We are the data controller for everything described
          below.
        </p>
        <LegalList>
          <li>Postal address: {SHOP_ADDRESS}, Bangladesh</li>
          <li>
            Email:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-foreground underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
          </li>
          <li>Phone: {SUPPORT_PHONE}</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="what-we-collect" title="2. What we collect">
        <p>We only collect what an order, a delivery or a support conversation actually needs.</p>
        <LegalList>
          <li>
            <strong className="text-foreground">Account details</strong> — your name, email address
            and (optionally) your phone number. If you sign in with Google or Facebook we receive
            your name, email address and profile picture from that provider. We never receive your
            Google or Facebook password.
          </li>
          <li>
            <strong className="text-foreground">Order and delivery details</strong> — the items you
            order, the delivery address and phone number you give us, your chosen delivery area
            (inside or outside Dhaka) and any note you add to the order.
          </li>
          <li>
            <strong className="text-foreground">Payment reference</strong> — for cash on delivery we
            store nothing beyond the amount due. For a bKash transfer we store the Transaction ID
            (TrxID) you paste into the checkout form so we can match your payment to your order.
          </li>
          <li>
            <strong className="text-foreground">Profile photo</strong> — if you upload one, the file
            is stored in our private-per-user storage bucket and served publicly by URL.
          </li>
          <li>
            <strong className="text-foreground">Technical data</strong> — standard web-server
            information such as IP address, browser user-agent and the pages you request. This is
            what any web host logs in order to stay online and to stop abuse.
          </li>
          <li>
            <strong className="text-foreground">Support conversations</strong> — messages you send us
            on Messenger or WhatsApp, so we can answer them and keep a record of the answer.
          </li>
        </LegalList>
        <p className="rounded-lg border border-dashed p-3">
          <strong className="text-foreground">We never collect or store</strong> card numbers, card
          security codes, bKash PINs, one-time passwords (OTPs) or your Google/Facebook password.
          Never send them to us — no member of staff will ever ask for them.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use-it" title="3. Why we use it">
        <LegalList>
          <li>To create and secure your account, and to keep you signed in.</li>
          <li>To accept, pack, invoice and deliver your orders, and to let you track them.</li>
          <li>To verify a bKash payment against the TrxID you provide.</li>
          <li>To contact you about an order — a delivery call, a stock problem or an address query.</li>
          <li>To answer support requests and to handle cancellations, returns and refunds.</li>
          <li>To detect fraud, abuse and duplicate accounts, and to keep the store available.</li>
          <li>
            To meet our legal and accounting obligations, such as keeping sales records for tax.
          </li>
        </LegalList>
        <p>
          We do not sell your personal data, and we do not use it for third-party advertising or
          profiling. We do not send marketing e-mail unless you ask us to.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="4. Cookies and local storage">
        <p>We use the smallest set of cookies that a signed-in store needs:</p>
        <LegalList>
          <li>
            <strong className="text-foreground">Session cookies</strong> — set by our authentication
            provider after you sign in (or during a sign-in attempt). They are essential: without
            them you cannot stay signed in, and the sign-in hand-off cannot complete.
          </li>
          <li>
            <strong className="text-foreground">Local storage</strong> — your cart contents and your
            light/dark theme preference are kept in your own browser, not on our servers.
          </li>
        </LegalList>
        <p>
          We do not run advertising or cross-site tracking cookies. Clearing your browser storage
          signs you out and empties your cart; it does not delete your account.
        </p>
      </LegalSection>

      <LegalSection id="sharing" title="5. Who we share it with">
        <p>
          We share data only with the service providers needed to run the store, and only the
          minimum each one needs. They may not use it for their own purposes.
        </p>
        <LegalList>
          <li>
            <strong className="text-foreground">Delivery partners</strong> — your name, delivery
            address and phone number, so a courier can hand over your parcel.
          </li>
          <li>
            <strong className="text-foreground">Supabase</strong> — our database, authentication and
            file-storage provider, which hosts your account row, your orders and your uploaded photo.
          </li>
          <li>
            <strong className="text-foreground">Vercel</strong> — our hosting provider, which serves
            the site and therefore processes request logs.
          </li>
          <li>
            <strong className="text-foreground">Google and Facebook</strong> — only if you choose to
            sign in with them. Their handling of your data is governed by their own privacy policies.
          </li>
          <li>
            <strong className="text-foreground">bKash</strong> — the payment reference on your order,
            to reconcile the transfer you made.
          </li>
        </LegalList>
        <p>
          We may also disclose data where the law requires it, or to establish or defend a legal
          claim.
        </p>
      </LegalSection>

      <LegalSection id="transfers" title="6. Where your data is stored">
        <p>
          Our database and hosting providers operate data centres outside Bangladesh, so your data
          may be transferred to and stored in another country. Where that happens we rely on those
          providers&rsquo; contractual data-protection commitments and keep the data limited to what
          is described in this policy.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="7. How long we keep it">
        <LegalList>
          <li>
            <strong className="text-foreground">Account and profile data</strong> — until you delete
            your account.
          </li>
          <li>
            <strong className="text-foreground">Order records</strong> — retained after account
            deletion in a form that no longer identifies you, except where we must keep an invoice or
            sales record to satisfy tax and accounting law.
          </li>
          <li>
            <strong className="text-foreground">Uploaded photos</strong> — deleted with your account.
          </li>
          <li>
            <strong className="text-foreground">Support messages</strong> — kept while the
            conversation is useful, then discarded.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="security" title="8. How we protect it">
        <p>
          Traffic to the store is encrypted in transit (HTTPS). Passwords are stored only as salted
          hashes by our authentication provider — nobody at {SITE_NAME} can read your password. Every
          database table is protected by row-level security, so a signed-in customer can only read
          their own profile, orders and order items; staff access is restricted to the accounts that
          need it.
        </p>
        <p>
          No system is perfect. If a breach ever affects your data, we will tell you and the relevant
          authority without undue delay.
        </p>
      </LegalSection>

      <LegalSection id="your-rights" title="9. Your choices and rights">
        <LegalList>
          <li>
            <strong className="text-foreground">Access and correction</strong> — see and edit your
            name, phone number and delivery address on{' '}
            <Link href="/account" prefetch className="text-foreground underline underline-offset-2">
              your account page
            </Link>
            .
          </li>
          <li>
            <strong className="text-foreground">Deletion</strong> — delete your account and the data
            linked to it, as described in the next section.
          </li>
          <li>
            <strong className="text-foreground">Withdraw a sign-in provider</strong> — remove our app
            from your Google or Facebook account settings at any time; you can keep signing in with
            your email address.
          </li>
          <li>
            <strong className="text-foreground">Object or restrict</strong> — contact us and we will
            explain what we can do, given the records we are legally required to keep.
          </li>
        </LegalList>
        <p>We answer every request within 30 days.</p>
      </LegalSection>

      <LegalSection id={DATA_DELETION_ANCHOR} title="10. How to delete your data">
        <p>
          You can have your account and the personal data linked to it deleted at any time. There are
          two ways to ask, and neither costs anything.
        </p>

        <div className="rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-foreground">
            Option A — request deletion by email
          </h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              Email{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Data%20deletion%20request`}
                className="text-foreground underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>{' '}
              from the address on your account, with the subject line
              &ldquo;Data deletion request&rdquo;.
            </li>
            <li>
              Tell us whether you want the whole account removed, or only specific data such as your
              profile photo or delivery address.
            </li>
            <li>
              We confirm receipt within 3 working days and complete the deletion within 30 days.
            </li>
          </ol>
        </div>

        <div className="rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-foreground">
            Option B — sign in and use your account
          </h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              Sign in, then open{' '}
              <Link href="/account" prefetch className="text-foreground underline underline-offset-2">
                your account page
              </Link>
              .
            </li>
            <li>
              Remove the details you control there — your profile photo, phone number and delivery
              address — immediately, or email us and ask for the account itself to be closed.
            </li>
          </ol>
        </div>

        <h3 className="pt-2 text-sm font-semibold text-foreground">What gets deleted</h3>
        <LegalList>
          <li>Your account record and sign-in credentials, so the account can no longer be used.</li>
          <li>Your profile row: name, phone number, delivery address and profile photo.</li>
          <li>Any uploaded profile picture file stored in our storage bucket.</li>
          <li>
            The identity link to Google or Facebook, so our app no longer appears as a connected app
            on that account.
          </li>
        </LegalList>

        <h3 className="pt-2 text-sm font-semibold text-foreground">What we must keep</h3>
        <p>
          Order and payment records (order number, items, amounts and the bKash TrxID) are retained
          for the period required by tax and accounting law, and to honour warranty and return
          claims. These are detached from your account and are not used to contact you again.
        </p>

        <p className="rounded-lg border border-dashed p-3">
          Deleting your account is permanent and cannot be undone. If you signed in with Google or
          Facebook you may also want to revoke our app&rsquo;s access from that provider&rsquo;s
          security settings — doing that alone does not remove the account we already created, so
          please use one of the options above as well.
        </p>
      </LegalSection>

      <LegalSection id="children" title="11. Children">
        <p>
          This store is meant for adults. We do not knowingly collect data from anyone under 18, and
          an account may only be created by someone old enough to enter into a contract. If you
          believe a child has created an account, contact us and we will remove it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="12. Changes to this policy">
        <p>
          If we change how we handle personal data we update this page and move the &ldquo;last
          updated&rdquo; date at the top. Material changes will also be announced on the storefront.
          Continuing to use the store after a change means you accept the updated policy.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="13. Contact us">
        <p>
          Questions about this policy, or a request about your data? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-foreground underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>{' '}
          or call {SUPPORT_PHONE}. You can also read our{' '}
          <Link href="/terms" prefetch className="text-foreground underline underline-offset-2">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
