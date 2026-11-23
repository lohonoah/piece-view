-- Migration: Support Direct Bank Transfer in place_customer_order and admin confirmation helper
-- Apply this in the Supabase SQL editor.

create or replace function public.place_customer_order(
  p_customer_name text,
  p_customer_email text,
  p_phone text,
  p_shipping_address text,
  p_payment_method text,
  p_items jsonb
)
returns table (order_id text, subtotal numeric, delivery_fee numeric, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_db_id bigint;
  v_public_id text;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 2500;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_payment_status text := 'Not required';
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(trim(p_customer_name),'') = '' or coalesce(trim(p_customer_email),'') = ''
     or coalesce(trim(p_shipping_address),'') = '' or coalesce(trim(p_phone),'') = '' then
    raise exception 'Complete all delivery details';
  end if;
  if p_payment_method not in ('Pay on delivery', 'Bank Transfer', 'Paystack') then
    raise exception 'Unsupported payment method';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Cart is empty';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if p_payment_method = 'Bank Transfer' then
    v_payment_status := 'Awaiting confirmation';
  elsif p_payment_method = 'Paystack' then
    v_payment_status := 'Pending';
  end if;

  v_public_id := 'PV-' || to_char(now(), 'YY') || '-' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');

  insert into public.customer_orders (
    public_id, user_id, customer_name, customer_email, phone,
    shipping_address, payment_method, payment_status, total, status
  )
  values (
    v_public_id, auth.uid(), trim(p_customer_name), lower(trim(p_customer_email)),
    trim(p_phone), trim(p_shipping_address), p_payment_method, v_payment_status, 0, 'Pending'
  )
  returning id into v_order_db_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then
      v_quantity := 1;
    end if;

    select id, name, product_type, price, stock_quantity, active, image
    into v_product
    from public.catalog_products
    where name = trim(v_item->>'name')
    for update;

    if not found or v_product.active = false then
      raise exception 'Item "%" is not available', trim(v_item->>'name');
    end if;

    if v_product.stock_quantity < v_quantity then
      raise exception 'Not enough stock for "%" (only % left)', v_product.name, v_product.stock_quantity;
    end if;

    update public.catalog_products
    set stock_quantity = stock_quantity - v_quantity,
        updated_at = now()
    where id = v_product.id;

    insert into public.customer_order_items (
      order_id, product_name, product_type, price, quantity, image
    )
    values (
      v_order_db_id, v_product.name, v_product.product_type,
      v_product.price, v_quantity, v_product.image
    );

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
  end loop;

  update public.customer_orders
  set total = v_subtotal + v_delivery_fee
  where id = v_order_db_id;

  insert into public.admin_orders (
    public_id, customer_name, customer_email, amount, status
  )
  values (
    v_public_id, trim(p_customer_name), lower(trim(p_customer_email)),
    '₦' || to_char(v_subtotal + v_delivery_fee, 'FM999,999,999'),
    'Pending'
  );

  insert into public.customer_order_status_history (order_id, status, note)
  values (
    v_order_db_id,
    'Pending',
    case
      when p_payment_method = 'Bank Transfer' then 'Order confirmed. Awaiting bank transfer verification.'
      else 'Order placed.'
    end
  );

  return query select v_public_id, v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee;
end;
$$;

-- 1-click Admin confirmation for bank transfer payments
create or replace function public.admin_confirm_bank_transfer(
  p_public_id text,
  p_note text default 'Bank transfer confirmed received. Order moved to processing.'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select id into v_order_id
  from public.customer_orders
  where public_id = p_public_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  update public.customer_orders
  set payment_status = 'Paid',
      status = 'Processing'
  where id = v_order_id;

  update public.admin_orders
  set status = 'Processing'
  where public_id = p_public_id;

  insert into public.customer_order_status_history (order_id, status, note)
  values (v_order_id, 'Processing', coalesce(p_note, 'Bank transfer confirmed received.'));
end;
$$;
