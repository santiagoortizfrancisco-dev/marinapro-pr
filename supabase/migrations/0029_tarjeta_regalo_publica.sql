-- =============================================================================
-- Tarjeta de regalo para la clienta: un link que la enseña en grande (con confeti).
-- El link lleva el id de la tarjeta (imposible de adivinar); solo enseña la tarjeta.
-- Se puede correr más de una vez sin romper nada.
-- =============================================================================

create or replace function public.gift_card_public(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business', coalesce(m.business_name, p.full_name), 'phone', p.phone, 'town', p.town,
    'logo_path', m.logo_path, 'brand_color', m.brand_color,
    'code', g.code, 'amount', g.amount, 'balance', g.balance,
    'recipient_name', g.recipient_name, 'buyer_name', g.buyer_name)
    from gift_cards g join mechanics m on m.profile_id = g.mechanic_id join profiles p on p.id = m.profile_id
   where g.id = p_id
$$;
grant execute on function public.gift_card_public(uuid) to anon, authenticated;
