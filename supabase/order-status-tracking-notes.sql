-- Let admins attach a customer-facing note to each order status change.
-- Apply after order-tracking-history.sql and order-inventory-safety.sql.

create or replace function public.record_customer_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text;
begin
  if tg_op = 'INSERT' then
    insert into public.customer_order_status_history (order_id, status, note, created_at)
    values (new.id, new.status, 'Order received', new.created_at);
  elsif new.status is distinct from old.status then
    v_note := nullif(trim(current_setting('pieceview.order_status_note', true)), '');
    insert into public.customer_order_status_history (order_id, status, note)
    values (new.id, new.status, coalesce(v_note, 'Order status updated to ' || new.status));
  end if;
  return new;
end;
$$;

create or replace function public.admin_update_customer_order_status_with_note(
  p_public_id text,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_current_status text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Tracking note must be 500 characters or fewer';
  end if;

  select id, status into v_order_id, v_current_status
  from public.customer_orders
  where public_id = p_public_id
  for update;

  if not found then
    perform public.update_customer_order_status(p_public_id, p_status);
    return;
  end if;

  if v_current_status = p_status then
    if v_note is not null then
      insert into public.customer_order_status_history (order_id, status, note)
      values (v_order_id, v_current_status, v_note);
    end if;
    return;
  end if;

  perform set_config('pieceview.order_status_note', coalesce(v_note, ''), true);
  perform public.update_customer_order_status(p_public_id, p_status);
  perform set_config('pieceview.order_status_note', '', true);
end;
$$;

revoke all on function public.admin_update_customer_order_status_with_note(text, text, text) from public;
grant execute on function public.admin_update_customer_order_status_with_note(text, text, text) to authenticated;
