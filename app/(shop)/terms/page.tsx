import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page';
import { OG_IMAGE, SITE_NAME, absoluteUrl, openGraphDefaults } from '@/lib/seo';
import { BKASH_NUMBER, SHOP_ADDRESS, SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/utils';

const TITLE = 'Terms of Service';
const DESCRIPTION = `The terms that apply when you buy from ${SITE_NAME}: accounts, prices in BDT, cash on delivery and bKash payment, delivery charges, cancellations, returns and refunds.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/terms' },
  openGraph: {
    ...openGraphDefaults,
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/terms'),
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function TermsOfServicePage() {
  return (
    <LegalPage
      title={TITLE}
      path="/terms"
      summary={`These terms form the agreement between you and ${SITE_NAME} when you use this store or place an order. Please read them before you buy — they cover payment, delivery charges, cancellations and returns.`}
    >
      <LegalSection id="agreement" title="1. These terms">
        <p>
          By browsing this store, creating an account or placing an order, you agree to these terms. If
          you do not accept them, please do not use the store.
        </p>
        <p>
          Our{' '}
          <Link href="/privacy" prefetch className="text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>{' '}
          explains how we handle your personal data and forms part of this agreement.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" title="2. Who may use the store">
        <LegalList>
          <li>You must be at least 18 and able to enter into a contract.</li>
          <li>
            The name, email address, phone number and delivery address you give us must be accurate
            and your own. An order we cannot deliver because the details were wrong is not our
            responsibility.
          </li>
          <li>
            We may refuse or cancel an order, and close an account, where we reasonably suspect fraud,
            abuse or a breach of these terms.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="accounts" title="3. Your account">
        <LegalList>
          <li>
            Checkout requires an account, so that an order always belongs to somebody we can contact
            and so you can track it. Guest checkout is not offered.
          </li>
          <li>
            Keep your password to yourself. You are responsible for activity under your account, so
            tell us immediately if you think someone else has access to it.
          </li>
          <li>
            You may sign in with Google or Facebook instead of a password. Their own terms apply to
            that account.
          </li>
          <li>
            Staff and operator accounts (used to run the store) cannot place orders. If you are signed
            in to one, switch to a customer account to buy.
          </li>
          <li>One account per person. Do not create accounts to abuse promotions or returns.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="products" title="4. Products, prices and availability">
        <LegalList>
          <li>
            All prices are in Bangladeshi Taka (BDT, ৳) and include any applicable tax. The final
            amount you pay, including the delivery charge, is shown in the order summary before you
            confirm.
          </li>
          <li>
            Stock is displayed live. An item can sell out between your visit and your order, and we
            may not be able to fulfil it.
          </li>
          <li>
            Product photographs and descriptions are provided in good faith but are illustrative.
            Minor differences in colour, packaging or bundled accessories do not count as a fault.
          </li>
          <li>
            If a price or description is obviously wrong (for example a decimal point in the wrong
            place) we may cancel the order and refund anything you have paid. We will tell you rather
            than quietly ship something different.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="orders" title="5. Placing an order">
        <p>
          Your order is an offer to buy. It is accepted — and a contract is formed — when we confirm
          the order and begin processing it. Until then we may decline it, for example where stock has
          run out or the delivery address is outside our service area.
        </p>
        <p>
          You can follow the progress of an order on{' '}
          <Link href="/orders" prefetch className="text-foreground underline underline-offset-2">
            your orders page
          </Link>
          . Orders move through <em>pending</em>, <em>processing</em>, <em>shipped</em> and{' '}
          <em>delivered</em>, and may be <em>cancelled</em>.
        </p>
      </LegalSection>

      <LegalSection id="payment" title="6. Payment">
        <LegalList>
          <li>
            <strong className="text-foreground">Cash on delivery</strong> — pay the courier in cash
            when the parcel arrives. Please have the exact amount ready.
          </li>
          <li>
            <strong className="text-foreground">bKash</strong> — send the total to {BKASH_NUMBER} and
            paste the Transaction ID (TrxID) into the checkout form. Your order is marked{' '}
            <em>awaiting verification</em> until we match the payment, and <em>paid</em> once we have.
            An order with a missing or mismatched TrxID cannot be dispatched.
          </li>
        </LegalList>
        <p>
          We never ask for your bKash PIN, an OTP or card details. Anyone who does is not us. Do not
          send money to a number other than the one shown at checkout.
        </p>
      </LegalSection>

      <LegalSection id="delivery" title="7. Delivery">
        <LegalList>
          <li>
            <strong className="text-foreground">Inside Dhaka</strong> — ৳60.
          </li>
          <li>
            <strong className="text-foreground">Outside Dhaka</strong> — ৳120.
          </li>
          <li>
            The charge is added to every order, and is recalculated live in the order summary if you
            change the delivery area. We do not offer free delivery above any order value.
          </li>
          <li>
            Delivery timescales are estimates, not guarantees. Couriers can be delayed by weather,
            traffic, strikes or a public holiday.
          </li>
          <li>
            Please make sure somebody can receive the parcel at the address and phone number you give
            us. A parcel returned to us as undeliverable because the address or number was wrong may
            be re-sent at your cost.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="cancellation" title="8. Cancellation, returns and refunds">
        <LegalList>
          <li>
            <strong className="text-foreground">Cancelling an order</strong> — you can cancel your
            self-service while an order is still <em>pending</em>. Once it is being processed or has
            shipped, contact us and we will do what we can; a dispatched parcel usually has to come
            back to us before it can be refunded.
          </li>
          <li>
            <strong className="text-foreground">Cancelling by us</strong> — we may cancel an order we
            cannot fulfil. Anything you have already paid is refunded in full.
          </li>
          <li>
            <strong className="text-foreground">Returns</strong> — if an item arrives damaged, faulty
            or different from what you ordered, tell us within 30 days of delivery and we will arrange
            a replacement or a refund. Items must be returned in the condition you received them,
            with any accessories and packaging.
          </li>
          <li>
            <strong className="text-foreground">What we cannot accept</strong> — change-of-mind
            returns of opened consumables, hygiene items or software licences, and damage caused after
            delivery.
          </li>
          <li>
            <strong className="text-foreground">Refunds</strong> — sent back the way you paid: to your
            bKash number for a bKash order, or in cash/transfer for a cash-on-delivery order. We
            process refunds within 7 working days of agreeing the return, though your provider may
            take longer to show the funds.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="acceptable-use" title="9. Acceptable use">
        <p>Please do not:</p>
        <LegalList>
          <li>place orders you do not intend to pay for or accept;</li>
          <li>use the store for anything unlawful, or to harass our staff;</li>
          <li>
            probe, scan or overload the store, or try to reach data belonging to another customer;
          </li>
          <li>scrape the catalogue or reuse product photography and copy without permission.</li>
        </LegalList>
        <p>
          Where these terms are broken we may cancel orders, suspend the account and, if necessary,
          report the matter.
        </p>
      </LegalSection>

      <LegalSection id="ip" title="10. Our content">
        <p>
          The store name, logo, page copy, product photography and the design of this site belong to{' '}
          {SITE_NAME} or are used with permission. You may not copy them for commercial use without
          our written consent. Product brand names and trademarks belong to their respective owners.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="11. Availability of the store">
        <p>
          We work to keep the store online and accurate, but it is provided &ldquo;as is&rdquo;. It may
          be unavailable during maintenance or because of a fault at one of our providers, and stock
          or pricing can change without notice. Nothing in these terms removes any right you have
          under the law of Bangladesh.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="12. Limits on our liability">
        <p>
          To the extent the law allows, our responsibility for an order is limited to the amount you
          paid for it, plus any delivery charge. We are not liable for indirect or consequential
          losses — for example lost profit or lost opportunity. We do not limit our liability for
          death or personal injury caused by our negligence, or for fraud.
        </p>
      </LegalSection>

      <LegalSection id="law" title="13. Governing law">
        <p>
          These terms are governed by the laws of Bangladesh, and the courts of Dhaka have
          jurisdiction over any dispute. We would much rather sort a problem out directly first —
          please contact us before taking any formal step.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="14. Changes to these terms">
        <p>
          We may update these terms as the store changes. The current version is always on this page,
          with the date at the top. The terms in force when you place an order are the ones that apply
          to that order.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="15. Contact us">
        <p>
          {SITE_NAME}, {SHOP_ADDRESS}, Bangladesh.
        </p>
        <LegalList>
          <li>
            Email:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-foreground underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
          </li>
          <li>Phone: {SUPPORT_PHONE}</li>
        </LegalList>
      </LegalSection>
    </LegalPage>
  );
}
