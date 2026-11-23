-- Harden checkout and add durable direct-bank-transfer evidence.

alter table public.customer_orders
  add column if not exists client_order_token text,
  add column if not exists bank_transfer_sender_name text,
  add column if not exists bank_transfer_sender_bank text,
  add column if not exists bank_transfer_reference text,
  add column if not exists bank_transfer_receipt_path text,
  add column if not exists bank_transfer_verified_at timestamptz,
  add column if not exists bank_transfer_verified_by uuid references auth.users(id);

create unique index if not exists customer_orders_client_order_token_key
  on public.customer_orders (client_order_token)
  where client_order_token is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bank-transfer-receipts',
  'bank-transfer-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Customers upload own transfer receipts" on storage.objects;
create policy "Customers upload own transfer receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'bank-transfer-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Customers read own transfer receipts" on storage.objects;
create policy "Customers read own transfer receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'bank-transfer-receipts'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "Customers delete own transfer receipts" on storage.objects;
create policy "Customers delete own transfer receipts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'bank-transfer-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop function if exists public.place_customer_order(text,text,text,text,text,jsonb);

create or replace function public.place_customer_order(
  p_customer_name text,
  p_customer_email text,
  p_phone text,
  p_shipping_address text,
  p_payment_method text,
  p_items jsonb,
  p_transfer_details jsonb default null,
  p_client_order_token text default null
)
returns table (order_id text, database_id bigint, subtotal numeric, delivery_fee numeric, total numeric)
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
  v_existing public.customer_orders%rowtype;
  v_sender_name text;
  v_sender_bank text;
  v_reference text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(trim(p_customer_name),'') = ''
     or coalesce(trim(p_customer_email),'') = ''
     or coalesce(trim(p_shipping_address),'') = ''
     or coalesce(trim(p_phone),'') = '' then
    raise exception 'Complete all delivery details';
  end if;
  if p_payment_method not in ('Pay on delivery', 'Bank Transfer', 'Paystack') then
    raise exception 'Unsupported payment method';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;
  if p_payment_method = 'Bank Transfer'
     and coalesce(trim(p_transfer_details->>'senderName'), '') = '' then
    raise exception 'Enter the sender account name for the bank transfer';
  end if;

  if coalesce(trim(p_client_order_token), '') <> '' then
    perform pg_advisory_xact_lock(hashtextextended(trim(p_client_order_token), 0));
    select * into v_existing
    from public.customer_orders
    where client_order_token = trim(p_client_order_token)
      and user_id = auth.uid();
    if found then
      return query
        select v_existing.public_id, v_existing.id,
               v_existing.total - v_delivery_fee,
               v_delivery_fee, v_existing.total;
      return;
    end if;
  end if;

  if p_payment_method = 'Bank Transfer' then
    v_payment_status := 'Awaiting confirmation';
  elsif p_payment_method = 'Paystack' then
    v_payment_status := 'Pending';
  end if;

  v_sender_name := nullif(trim(p_transfer_details->>'senderName'), '');
  v_sender_bank := nullif(trim(p_transfer_details->>'senderBank'), '');
  v_reference := nullif(trim(p_transfer_details->>'transactionReference'), '');

  v_public_id := 'PV-' || to_char(now(), 'YY') || '-' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');

  insert into public.customer_orders (
    public_id, user_id, customer_name, customer_email, phone,
    shipping_address, payment_method, payment_status, total, status,
    client_order_token, bank_transfer_sender_name,
    bank_transfer_sender_bank, bank_transfer_reference
  )
  values (
    v_public_id, auth.uid(), trim(p_customer_name), lower(trim(p_customer_email)),
    trim(p_phone), trim(p_shipping_address), p_payment_method, v_payment_status,
    0, 'Pending', nullif(trim(p_client_order_token), ''),
    v_sender_name, v_sender_bank, v_reference
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
    where name = trim(v_item->>'name') and active = true
    for update;

    if not found then
      raise exception 'Product unavailable: %', trim(v_item->>'name');
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
    set stock_quantity = stock_quantity - v_quantity,
        updated_at = now()
    where id = v_product.id;

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
  end loop;

  update public.customer_orders
  set total = v_subtotal + v_delivery_fee
  where id = v_order_db_id;

  insert into public.admin_orders (
    public_id, customer_name, customer_email, amount, status, created_at
  )
  values (
    v_public_id, trim(p_customer_name), lower(trim(p_customer_email)),
    '₦' || to_char(v_subtotal + v_delivery_fee, 'FM999,999,999'),
    'Pending', now()
  )
  on conflict (public_id) where public_id is not null do update
  set customer_name = excluded.customer_name,
      customer_email = excluded.customer_email,
      amount = excluded.amount,
      status = excluded.status,
      created_at = excluded.created_at;

  return query
    select v_public_id, v_order_db_id, v_subtotal, v_delivery_fee,
           v_subtotal + v_delivery_fee;
end;
$$;

revoke all on function public.place_customer_order(text,text,text,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.place_customer_order(text,text,text,text,text,jsonb,jsonb,text) to authenticated;

create or replace function public.attach_bank_transfer_receipt(
  p_public_id text,
  p_receipt_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(trim(p_receipt_path), '') = '' then
    raise exception 'Receipt path is required';
  end if;
  if p_receipt_path not like (auth.uid()::text || '/%') then
    raise exception 'Receipt path is invalid';
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'bank-transfer-receipts'
      and name = p_receipt_path
      and (storage.foldername(name))[1] = auth.uid()::text
  ) then
    raise exception 'Receipt file was not found in your private receipt folder';
  end if;

  update public.customer_orders
  set bank_transfer_receipt_path = p_receipt_path
  where public_id = p_public_id
    and user_id = auth.uid()
    and payment_method = 'Bank Transfer';

  if not found then
    raise exception 'Bank transfer order not found';
  end if;
end;
$$;

revoke all on function public.attach_bank_transfer_receipt(text,text) from public, anon;
grant execute on function public.attach_bank_transfer_receipt(text,text) to authenticated;

create or replace function public.admin_confirm_bank_transfer(
  p_public_id text,
  p_note text default 'Bank transfer verified and confirmed by administrator.'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_payment_method text;
  v_payment_status text;
  v_order_status text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select id, payment_method, payment_status, status
    into v_order_id, v_payment_method, v_payment_status, v_order_status
  from public.customer_orders
  where public_id = p_public_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  if v_payment_method <> 'Bank Transfer' then
    raise exception 'This order was not placed by bank transfer';
  end if;
  if v_order_status = 'Cancelled' then
    raise exception 'Cancelled orders cannot be confirmed as paid';
  end if;
  if v_payment_status = 'Paid' then
    return;
  end if;

  update public.customer_orders
  set payment_status = 'Paid',
      status = 'Processing',
      bank_transfer_verified_at = now(),
      bank_transfer_verified_by = auth.uid()
  where id = v_order_id;

  update public.admin_orders
  set status = 'Processing'
  where public_id = p_public_id;

  insert into public.customer_order_status_history (order_id, status, note)
  values (v_order_id, 'Processing', coalesce(nullif(trim(p_note), ''), 'Bank transfer verified.'));
end;
$$;

revoke all on function public.admin_confirm_bank_transfer(text,text) from public, anon, authenticated;
grant execute on function public.admin_confirm_bank_transfer(text,text) to authenticated;

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

  select * into v_order
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

  if v_order.payment_method = 'Paystack'
     and v_order.payment_status <> 'Paid'
     and p_status <> 'Cancelled' then
    raise exception 'Do not process this order until Paystack confirms payment';
  end if;
  if v_order.payment_method = 'Bank Transfer'
     and v_order.payment_status <> 'Paid'
     and p_status not in ('Pending', 'Cancelled') then
    raise exception 'Do not process this order until the bank transfer is confirmed';
  end if;

  if v_order.status = p_status then
    return;
  end if;

  if v_order.status <> 'Cancelled' and p_status = 'Cancelled' then
    for v_item in
      select product_name, quantity
      from public.customer_order_items
      where order_id = v_order.id
    loop
      update public.catalog_products
      set stock_quantity = stock_quantity + v_item.quantity,
          updated_at = now()
      where name = v_item.product_name;
    end loop;
  elsif v_order.status = 'Cancelled' and p_status <> 'Cancelled' then
    if v_order.payment_method = 'Paystack'
       and v_order.payment_status <> 'Paid' then
      raise exception 'Cancelled Paystack orders cannot be reopened';
    end if;

    for v_item in
      select product_name, quantity
      from public.customer_order_items
      where order_id = v_order.id
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

revoke all on function public.update_customer_order_status(text,text) from public, anon, authenticated;
grant execute on function public.update_customer_order_status(text,text) to authenticated;
