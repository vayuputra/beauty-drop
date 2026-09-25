import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  brandSources,
  checkoutJobs,
  checkoutSteps,
  productOffers,
  productVariants,
  products,
  retailers,
  userAddresses,
  users,
  type CheckoutJob,
  type CheckoutStep,
} from "@shared/schema";
import { fetchJson } from "../ingest/http";
import { decryptJson, encryptJson } from "../lib/crypto";
import { addressSummary, type AddressFields } from "./address";
import {
  amazonAssociateTag,
  buildAmazonCartUrl,
  buildShopifyCartUrl,
  checkoutModeFor,
  extractAsin,
  type CheckoutMode,
} from "./plan";
import { assertNoPaymentStep } from "./paymentGuard";

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export interface AddressView {
  id: number;
  label: string;
  country: string;
  isDefault: boolean;
  summary: string;
  address: AddressFields;
}

export async function listAddresses(userId: string): Promise<AddressView[]> {
  const rows = await db
    .select()
    .from(userAddresses)
    .where(eq(userAddresses.userId, userId))
    .orderBy(desc(userAddresses.isDefault), desc(userAddresses.updatedAt));
  return rows.map((r) => {
    const address = decryptJson<AddressFields>(r.encrypted);
    return { id: r.id, label: r.label, country: r.country, isDefault: r.isDefault, summary: addressSummary(address), address };
  });
}

export async function createAddress(userId: string, input: { label: string; isDefault?: boolean; address: AddressFields }): Promise<AddressView> {
  const existing = await db.select({ id: userAddresses.id }).from(userAddresses).where(eq(userAddresses.userId, userId));
  if (existing.length >= 10) throw new CheckoutError("You can save up to 10 addresses");
  const makeDefault = input.isDefault || existing.length === 0;

  const row = await db.transaction(async (tx) => {
    if (makeDefault) await tx.update(userAddresses).set({ isDefault: false }).where(eq(userAddresses.userId, userId));
    const [created] = await tx
      .insert(userAddresses)
      .values({
        userId,
        label: input.label,
        country: input.address.country,
        encrypted: encryptJson(input.address),
        isDefault: makeDefault,
      })
      .returning();
    return created;
  });
  return { id: row.id, label: row.label, country: row.country, isDefault: row.isDefault, summary: addressSummary(input.address), address: input.address };
}

export async function deleteAddress(userId: string, id: number): Promise<void> {
  const [deleted] = await db
    .delete(userAddresses)
    .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
    .returning();
  if (!deleted) throw new CheckoutError("Address not found", 404);
  if (deleted.isDefault) {
    const [next] = await db.select().from(userAddresses).where(eq(userAddresses.userId, userId)).limit(1);
    if (next) await db.update(userAddresses).set({ isDefault: true }).where(eq(userAddresses.id, next.id));
  }
}

async function getOwnedAddress(userId: string, id: number): Promise<AddressFields> {
  const [row] = await db.select().from(userAddresses).where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)));
  if (!row) throw new CheckoutError("Address not found", 404);
  return decryptJson<AddressFields>(row.encrypted);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function logStep(jobId: number, step: string, status: "ok" | "warning" | "failed", detail?: string) {
  await db.insert(checkoutSteps).values({ jobId, step, status, detail: detail ?? null });
}

async function setStatus(jobId: number, status: CheckoutJob["status"], extra: Partial<CheckoutJob> = {}) {
  await db.update(checkoutJobs).set({ status, updatedAt: new Date(), ...extra }).where(eq(checkoutJobs.id, jobId));
}

/** Live price + stock for one Shopify variant, from the store's public product JSON. */
export async function checkShopifyVariant(
  productUrl: string,
  variantExternalId: string,
): Promise<{ price: number | null; available: boolean | null }> {
  const url = new URL(productUrl);
  const json = await fetchJson<{ variants?: { id: number; price: number | string; available?: boolean }[] }>(
    `${url.origin}${url.pathname.replace(/\/$/, "")}.js`,
    { timeoutMs: 8_000 },
  );
  const v = json.variants?.find((x) => String(x.id) === variantExternalId);
  if (!v) return { price: null, available: false };
  // The .js endpoint reports prices in minor units (cents / paise).
  const cents = typeof v.price === "string" ? Number(v.price) : v.price;
  return { price: Number.isFinite(cents) ? cents / 100 : null, available: typeof v.available === "boolean" ? v.available : null };
}

export interface CreateJobInput {
  offerId: number;
  variantId?: number | null;
  quantity?: number;
  addressId?: number | null;
  shareAddress?: boolean;
}

/**
 * Prepares a cart at the chosen seller and stops before payment. Every action
 * is written to checkout_steps. Returns the job with its steps.
 */
export async function createCheckoutJob(userId: string, input: CreateJobInput) {
  const quantity = Math.min(Math.max(Math.trunc(input.quantity ?? 1), 1), 10);

  const [row] = await db
    .select({ offer: productOffers, retailer: retailers, product: products })
    .from(productOffers)
    .innerJoin(retailers, eq(productOffers.retailerId, retailers.id))
    .innerJoin(products, eq(productOffers.productId, products.id))
    .where(eq(productOffers.id, input.offerId));
  if (!row) throw new CheckoutError("That offer is no longer available", 404);
  const { offer, retailer, product } = row;

  const variants = await db.select().from(productVariants).where(eq(productVariants.productId, product.id));
  const mode: CheckoutMode = checkoutModeFor({ ...offer, retailer }, product, variants.length > 0);

  let variant = input.variantId ? variants.find((v) => v.id === input.variantId) : undefined;
  if (input.variantId && !variant) throw new CheckoutError("That shade isn't available for this product");
  if (mode === "cart_permalink" && !variant) {
    if (variants.length === 1) variant = variants[0];
    else throw new CheckoutError("Pick a shade first");
  }

  const wantsAddress = mode === "cart_permalink" && !!input.shareAddress;
  if (wantsAddress && !input.addressId) throw new CheckoutError("Choose an address to share");
  if (input.addressId) await getOwnedAddress(userId, input.addressId); // ownership check

  const quotedPrice = variant?.price ?? offer.price;
  const [job] = await db
    .insert(checkoutJobs)
    .values({
      userId,
      productId: product.id,
      offerId: offer.id,
      variantId: variant?.id ?? null,
      quantity,
      addressId: wantsAddress ? input.addressId! : null,
      strategy: mode,
      status: "preparing",
      retailerName: retailer.name,
      quotedPrice,
      currency: offer.currency,
      addressConsentAt: wantsAddress ? new Date() : null,
    })
    .returning();

  await logStep(job.id, "Request received", "ok", `${quantity} × ${product.name}${variant && variants.length > 1 ? ` (${variant.title})` : ""} from ${retailer.name}`);

  try {
    if (mode === "cart_permalink") {
      // Re-check price and stock with the store before building the cart.
      try {
        const live = await checkShopifyVariant(product.productUrl!, variant!.externalId);
        if (live.available === false) {
          await logStep(job.id, "Checked stock with the store", "failed", `${variant!.title} is sold out at ${retailer.name}`);
          await setStatus(job.id, "failed", { error: "Sold out at this store" });
          return getCheckoutJob(userId, job.id);
        }
        if (live.price != null && quotedPrice != null && Math.abs(live.price - quotedPrice) >= 0.01) {
          await logStep(job.id, "Checked price with the store", "warning", `Price changed from ${quotedPrice} to ${live.price} ${offer.currency}`);
        } else {
          await logStep(job.id, "Checked price and stock with the store", "ok", "In stock at the price shown");
        }
        await setStatus(job.id, "preparing", { confirmedPrice: live.price ?? quotedPrice });
      } catch {
        await logStep(job.id, "Checked price with the store", "warning", "Couldn't reach the store just now; showing the last price we saw");
      }
      await logStep(job.id, "Prepared cart", "ok", `Cart link for ${quantity} × ${variant!.title}`);
      await logStep(
        job.id,
        wantsAddress ? "Checkout details ready to pre-fill" : "Checkout details",
        "ok",
        wantsAddress ? `Your name, email and address will be filled in on ${retailer.name}'s checkout` : "You'll enter your details on the store's checkout",
      );
    } else if (mode === "amazon_cart") {
      await logStep(job.id, "Prepared Amazon cart link", "ok", "Amazon uses the addresses saved in your Amazon account");
    } else {
      await logStep(job.id, "Seller page ready", "ok", `Automatic carts aren't available at ${retailer.name} yet; you'll pick up on their product page`);
    }
    await logStep(job.id, "Stopped before payment", "ok", "You review and pay on the seller's checkout. We never see your card.");
    await setStatus(job.id, "ready_for_payment");
  } catch (err) {
    await logStep(job.id, "Preparing cart", "failed", err instanceof Error ? err.message : "Unexpected error");
    await setStatus(job.id, "failed", { error: "Couldn't prepare the cart" });
  }

  return getCheckoutJob(userId, job.id);
}

export async function getCheckoutJob(userId: string, jobId: number) {
  const [job] = await db.select().from(checkoutJobs).where(and(eq(checkoutJobs.id, jobId), eq(checkoutJobs.userId, userId)));
  if (!job) throw new CheckoutError("Not found", 404);
  const steps = await db.select().from(checkoutSteps).where(eq(checkoutSteps.jobId, job.id)).orderBy(checkoutSteps.id);
  return { ...job, steps };
}

export async function listCheckoutJobs(userId: string, sinceDays = 14) {
  const jobs = await db
    .select({ job: checkoutJobs, product: { id: products.id, name: products.name, brand: products.brand, imageUrl: products.imageUrl, category: products.category } })
    .from(checkoutJobs)
    .innerJoin(products, eq(checkoutJobs.productId, products.id))
    .where(and(eq(checkoutJobs.userId, userId), gte(checkoutJobs.createdAt, new Date(Date.now() - sinceDays * 86400_000))))
    .orderBy(desc(checkoutJobs.createdAt))
    .limit(50);
  const ids = jobs.map((j) => j.job.id);
  const steps: CheckoutStep[] = ids.length
    ? await db.select().from(checkoutSteps).where(inArray(checkoutSteps.jobId, ids)).orderBy(checkoutSteps.id)
    : [];
  return jobs.map(({ job, product }) => ({ ...job, product, steps: steps.filter((s) => s.jobId === job.id) }));
}

/**
 * Builds the seller URL for a ready job (adding personal details only if the
 * user consented) and records the hand-off. The URL is never stored.
 */
export async function openCheckoutJob(userId: string, jobId: number): Promise<string> {
  const job = await getCheckoutJob(userId, jobId);
  if (job.status !== "ready_for_payment" && job.status !== "handed_off") throw new CheckoutError("This cart isn't ready", 409);

  const [row] = await db
    .select({ offer: productOffers, product: products })
    .from(productOffers)
    .innerJoin(products, eq(productOffers.productId, products.id))
    .where(eq(productOffers.id, job.offerId));
  if (!row) throw new CheckoutError("That offer is no longer available", 410);

  let url: string;
  if (job.strategy === "cart_permalink") {
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, job.variantId!));
    const [source] = await db.select().from(brandSources).where(eq(brandSources.id, row.product.brandSourceId!));
    if (!variant || !source) throw new CheckoutError("This product changed; start again", 410);
    let email: string | null = null;
    let address: AddressFields | null = null;
    if (job.addressId && job.addressConsentAt) {
      address = await getOwnedAddress(userId, job.addressId).catch(() => null);
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
      email = user?.email ?? null;
    }
    const domain = new URL(row.product.productUrl!).hostname || source.domain;
    url = buildShopifyCartUrl({ domain, variantExternalId: variant.externalId, quantity: job.quantity, email, address });
  } else if (job.strategy === "amazon_cart") {
    const asin = extractAsin(row.offer.affiliateUrl);
    url = asin
      ? buildAmazonCartUrl({ country: row.product.country, asin, quantity: job.quantity, associateTag: amazonAssociateTag(row.product.country) })
      : row.offer.affiliateUrl;
  } else {
    url = row.offer.affiliateUrl;
  }

  assertNoPaymentStep(url);
  if (job.status !== "handed_off") {
    await logStep(job.id, "Opened seller checkout", "ok", `Handed over to ${job.retailerName}`);
    await setStatus(job.id, "handed_off");
  }
  return url;
}

export async function cancelCheckoutJob(userId: string, jobId: number) {
  const job = await getCheckoutJob(userId, jobId);
  if (job.status === "cancelled") return job;
  await logStep(job.id, "Cancelled", "ok", "Removed from your Bag");
  await setStatus(job.id, "cancelled");
  return getCheckoutJob(userId, jobId);
}
