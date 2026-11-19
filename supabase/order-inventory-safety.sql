-- Inventory safety migration for existing Piece View Supabase projects.
-- Apply after the customer-commerce schema exists. Safe to reapply.

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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(trim(p_customer_name),'') = '' or coalesce(trim(p_customer_email),'') = ''
     or coalesce(trim(p_shipping_address),'') = '' or coalesce(trim(p_phone),'') = '' then
    raise exception 'Complete all delivery details';
  end if;
  if p_payment_method not in ('Pay on delivery') then
    raise exception 'Unsupported payment method';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Cart is empty';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  v_public_id := 'PV-' || to_char(now(), 'YY') || '-' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');

  insert into public.customer_orders (
    public_id, user_id, customer_name, customer_email, phone,
    shipping_address, payment_method, total, status
  )
  values (
    v_public_id, auth.uid(), trim(p_customer_name), lower(trim(p_customer_email)),
    trim(p_phone), trim(p_shipping_address), p_payment_method, 0, 'Pending'
  )
  returning id into v_order_db_id;

  for v_item in
    select item
    from jsonb_array_elements(p_items) as cart_items(item)
    order by item->>'name'
  loop
    if coalesce(trim(v_item->>'name'), '') = '' then
      raise exception 'Cart contains an invalid product';
    end if;
    v_quantity := coalesce((v_item->>'quantity')::integer, 1);
    if v_quantity < 1 or v_quantity > 20 then
      raise exception 'Quantity must be between 1 and 20 for %', v_item->>'name';
    end if;
    select * into v_product
    from public.catalog_products
    where name = v_item->>'name' and active = true
    for update;

    if not found then
      raise exception 'Product unavailable: %', v_item->>'name';
    end if;
    if v_product.stock_quantity < v_quantity then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;

    insert into public.customer_order_items (
      order_id, product_name, product_type, price, quantity, image
    )
    values (
      v_order_db_id, v_product.name, v_product.product_type,
      v_product.price, v_quantity, v_product.image
    );

    update public.catalog_products
    set stock_quantity = stock_quantity - v_quantity, updated_at = now()
    where id = v_product.id;

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
  end loop;

  update public.customer_orders
  set total = v_subtotal + v_delivery_fee
  where id = v_order_db_id;

  update public.admin_orders
  set amount = (v_subtotal + v_delivery_fee)::text
  where public_id = v_public_id;

  return query select v_public_id, v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee;
end;
$$;

revoke all on function public.place_customer_order(text,text,text,text,text,jsonb) from public;
grant execute on function public.place_customer_order(text,text,text,text,text,jsonb) to authenticated;

create or replace function public.update_customer_order_status(p_public_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_product record;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('Pending','Processing','Out for delivery','Completed','Cancelled') then
    raise exception 'Invalid order status';
  end if;

  select id, status into v_order
  from public.customer_orders
  where public_id = p_public_id
  for update;

  if not found then
    update public.admin_orders set status = p_status where public_id = p_public_id;
    if not found then
      raise exception 'Order not found: %', p_public_id;
    end if;
    return;
  end if;

  if v_order.status = p_status then
    return;
  end if;

  if v_order.status <> 'Cancelled' and p_status = 'Cancelled' then
    for v_item in
      select product_name, quantity
      from public.customer_order_items
      where order_id = v_order.id
      order by product_name
    loop
      update public.catalog_products
      set stock_quantity = stock_quantity + v_item.quantity,
          updated_at = now()
      where name = v_item.product_name;
    end loop;
  elsif v_order.status = 'Cancelled' and p_status <> 'Cancelled' then
    for v_item in
      select product_name, quantity
      from public.customer_order_items
      where order_id = v_order.id
      order by product_name
    loop
      select id, name, stock_quantity into v_product
      from public.catalog_products
      where name = v_item.product_name and active = true
      for update;

      if not found then
        raise exception 'Cannot reopen order: product unavailable: %', v_item.product_name;
      end if;
      if v_product.stock_quantity < v_item.quantity then
        raise exception 'Cannot reopen order: insufficient stock for %', v_product.name;
      end if;

      update public.catalog_products
      set stock_quantity = stock_quantity - v_item.quantity,
          updated_at = now()
      where id = v_product.id;
    end loop;
  end if;

  update public.customer_orders
  set status = p_status
  where id = v_order.id;

  update public.admin_orders
  set status = p_status
  where public_id = p_public_id;
end;
$$;

revoke all on function public.update_customer_order_status(text,text) from public;
grant execute on function public.update_customer_order_status(text,text) to authenticated;

update public.admin_orders as admin_order
set amount = customer_order.total::text
from public.customer_orders as customer_order
where admin_order.public_id = customer_order.public_id;
