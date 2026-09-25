/**
 * The hard stop before payment, enforced in code rather than by instructions.
 *
 * Cart links (today) can't pay by construction; `assertNoPaymentStep` checks
 * every URL the agent hands out. The browser agent (next phase) must run each
 * candidate click/type through `isPaymentAction` and refuse anything it flags.
 */

// Buttons/links that submit an order or payment.
const PAYMENT_TEXT =
  /\b(place (your |my )?order|pay( now| securely| ₹| rs\.?| \$|\s*₹|\s*\$)|complete (your )?(order|purchase|payment)|confirm (and|&) pay|submit (order|payment)|proceed to pay(ment)?|make payment|buy now|checkout with (paypal|apple pay|google pay|shop pay|gpay)|place order and pay)\b/i;

// Inputs that hold payment credentials.
const PAYMENT_FIELD =
  /(card[\s_-]?(number|no|holder|name)|cc[-_]?(number|num|exp|csc)|\bcvv\b|\bcvc\b|\bcsc\b|security[\s_-]?code|expir(y|ation)|\bupi\b|vpa|netbanking|net[\s_-]?banking|\botp\b|one[\s_-]?time[\s_-]?password|\b(atm|card|upi|m)[\s_-]?pin\b)/i;

// Autocomplete tokens the HTML spec reserves for payment details.
const PAYMENT_AUTOCOMPLETE = /^cc-/i;

export interface CandidateAction {
  /** Visible text or accessible name of the element. */
  text?: string | null;
  /** name / id / aria-label / placeholder of an input. */
  name?: string | null;
  autocomplete?: string | null;
  /** URL a click would navigate to or a form would submit to. */
  url?: string | null;
}

export function isPaymentAction(a: CandidateAction): boolean {
  if (a.text && PAYMENT_TEXT.test(a.text)) return true;
  if (a.name && PAYMENT_FIELD.test(a.name)) return true;
  if (a.autocomplete && PAYMENT_AUTOCOMPLETE.test(a.autocomplete)) return true;
  if (a.url && isPaymentUrl(a.url)) return true;
  return false;
}

/** Order-submission endpoints and payment gateways. Checkout *pages* are fine; submitting them is not. */
export function isPaymentUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  if (/(^|\.)(razorpay|paytm|payu|stripe|adyen|braintreegateway|paypal|cashfree|ccavenue|billdesk)\.(com|in|net)$/.test(host)) return true;
  if (/\/(payment|payments|pay|place[-_]?order|submit[-_]?order|complete[-_]?order|processing)(\/|$)/.test(path)) return true;
  return false;
}

/** Throws if a URL the agent is about to hand to the user would submit payment. */
export function assertNoPaymentStep(url: string): string {
  if (isPaymentUrl(url)) throw new Error("Refusing to hand off a payment URL");
  return url;
}
