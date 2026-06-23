/*
  # Drop Orphaned Stripe Tables

  These tables were created by an earlier edge-function-based Stripe integration
  that has since been replaced by Next.js API routes using the `subscriptions`,
  `usage_quotas`, and `payment_history` tables. The edge functions that wrote to
  these tables have been removed and no application code references them.

  1. Dropped Views
    - `stripe_user_orders` - unused secure view for user order history
    - `stripe_user_subscriptions` - unused secure view for user subscriptions

  2. Dropped Tables
    - `stripe_orders` - 0 rows, unused one-time payment records
    - `stripe_subscriptions` - 0 rows, unused subscription tracking
    - `stripe_customers` - 0 rows, unused customer mapping

  3. Dropped Types
    - `stripe_order_status` - enum for order status (pending/completed/canceled)
    - `stripe_subscription_status` - enum for subscription lifecycle

  4. Security
    - No data loss: all three tables contain 0 rows
    - Active payment flow uses `subscriptions` + `payment_history` tables
*/

DROP VIEW IF EXISTS stripe_user_orders;
DROP VIEW IF EXISTS stripe_user_subscriptions;

DROP TABLE IF EXISTS stripe_orders;
DROP TABLE IF EXISTS stripe_subscriptions;
DROP TABLE IF EXISTS stripe_customers;

DROP TYPE IF EXISTS stripe_order_status;
DROP TYPE IF EXISTS stripe_subscription_status;
