-- Run once on an EXISTING database before `npm run db:push` adds the new unique
-- indexes (favorites, price trackers, trust scores, review summaries, articles).
-- It removes duplicate rows that would otherwise make the push fail.
-- Safe to re-run. Fresh databases don't need it.
BEGIN;

-- Keep the oldest favorite / tracker per (user, product).
DELETE FROM favorites a USING favorites b
  WHERE a.user_id = b.user_id AND a.product_id = b.product_id AND a.id > b.id;
DELETE FROM price_trackers a USING price_trackers b
  WHERE a.user_id = b.user_id AND a.product_id = b.product_id AND a.id > b.id;

-- Keep the newest AI-derived row per product.
DELETE FROM product_trust_scores a USING product_trust_scores b
  WHERE a.product_id = b.product_id AND a.id < b.id;
DELETE FROM product_review_summaries a USING product_review_summaries b
  WHERE a.product_id = b.product_id AND a.id < b.id;

-- Keep the first copy of each article per product.
DELETE FROM product_articles a USING product_articles b
  WHERE a.product_id = b.product_id AND a.url = b.url AND a.id > b.id;

COMMIT;

-- Phase 1: one offer per (product, retailer). Keep the most recently updated.
BEGIN;
DELETE FROM product_offers a USING product_offers b
  WHERE a.product_id = b.product_id AND a.retailer_id = b.retailer_id
    AND (COALESCE(a.last_updated, 'epoch'::timestamp), a.id) < (COALESCE(b.last_updated, 'epoch'::timestamp), b.id);
COMMIT;
