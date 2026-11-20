-- Keep customer orders and their line items writable only through the
-- place_customer_order security-definer RPC. Apply after customer-commerce.sql.

alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;

drop policy if exists "Customers create own orders" on public.customer_orders;
drop policy if exists "Customers create own order items" on public.customer_order_items;

-- Customers retain read access to their own orders/items. Administrators retain
-- their existing management policies. Checkout inserts run as the function owner.
