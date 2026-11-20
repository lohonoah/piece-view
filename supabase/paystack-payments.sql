-- Paystack payment state and server-only settlement.
-- Apply after customer-commerce.sql and order-inventory-safety.sql.

alter table public.customer_orders
  add column if not exists payment_status text not null default 'Not required',
  add column if not exists paystack_reference text;

create unique index if not exists customer_orders_paystack_reference_key
  on public.customer_orders (paystack_reference)
  where paystack_reference is not null;

create or replace function public.settle_paystack_order(
  p_reference text,
  p_succeeded boolean,
  p_amount_kobo bigint default null,
  p_currency text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.customer_orders%rowtype;
  v_item record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Payment settlement is restricted to the payment service';
  end if;

  select * into v_order
  from public.customer_orders
  where paystack_reference = p_reference
  for update;

  if not found then
    raise exception 'Payment reference was not found';
  end if;

  if p_succeeded then
    if p_currency <> 'NGN' or p_amount_kobo is distinct from round(v_order.total * 100)::bigint then
      raise exception 'Verified payment amount does not match the order';
    end if;
    if v_order.payment_status = 'Paid' then return; end if;
    if v_order.payment_status = 'Failed' or v_order.status = 'Cancelled' then
      raise exception 'This order is no longer payable';
    end if;
    update public.customer_orders set payment_status = 'Paid', payment_method = 'Paystack'
    where id = v_order.id;
  else
    if v_order.payment_status in ('Paid', 'Failed') then return; end if;
    for v_item in
      select product_name, quantity from public.customer_order_items
      where order_id = v_order.id order by product_name
    loop
      update public.catalog_products
      set stock_quantity = stock_quantity + v_item.quantity, updated_at = now()
      where name = v_item.product_name;
    end loop;
    update public.customer_orders
    set payment_status = 'Failed', payment_method = 'Paystack', status = 'Cancelled'
    where id = v_order.id;
    update public.admin_orders set status = 'Cancelled' where public_id = v_order.public_id;
  end if;
end;
$$;

revoke all on function public.settle_paystack_order(text, boolean, bigint, text) from public, anon, authenticated;
grant execute on function public.settle_paystack_order(text, boolean, bigint, text) to service_role;
