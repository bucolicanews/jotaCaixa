create or replace function criar_aditivo_contratual(p_aditivo_data jsonb, p_parcelas_updates jsonb)
returns void
language plpgsql
security definer
as $$
declare
  parcela_update jsonb;
begin
  -- Inserir o registro do aditivo
  insert into public.admin_aditivos_contratuais (
    conta_receber_id,
    admin_id,
    tipo_aditivo,
    valor_ajuste,
    modo_distribuicao,
    motivo,
    observacao,
    valor_contrato_anterior,
    valor_contrato_novo,
    quantidade_parcelas_afetadas,
    status
  )
  values (
    (p_aditivo_data->>'conta_receber_id')::uuid,
    (p_aditivo_data->>'admin_id')::uuid,
    p_aditivo_data->>'tipo_aditivo',
    (p_aditivo_data->>'valor_ajuste')::numeric,
    p_aditivo_data->>'modo_distribuicao',
    p_aditivo_data->>'motivo',
    p_aditivo_data->>'observacao',
    (p_aditivo_data->>'valor_contrato_anterior')::numeric,
    (p_aditivo_data->>'valor_contrato_novo')::numeric,
    (p_aditivo_data->>'quantidade_parcelas_afetadas')::integer,
    p_aditivo_data->>'status'
  );

  -- Atualizar cada parcela afetada
  for parcela_update in select * from jsonb_array_elements(p_parcelas_updates)
  loop
    update public.admin_parcelas_receber
    set valor = (parcela_update->>'novo_valor')::numeric, updated_at = now()
    where id = (parcela_update->>'id')::uuid;
  end loop;

  -- (Opcional, mas recomendado) Atualizar o valor total na tabela contas_receber
  update public.admin_contas_receber
  set valor_total = (p_aditivo_data->>'valor_contrato_novo')::numeric, updated_at = now()
  where id = (p_aditivo_data->>'conta_receber_id')::uuid;

end;
$$;
