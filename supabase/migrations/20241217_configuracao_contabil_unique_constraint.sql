-- Garante que exista restrição única para uso de upsert com on_conflict
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'configuracao_contabil_proprietario_tipo_unique'
  ) then
    alter table if exists public.configuracao_contabil
      add constraint configuracao_contabil_proprietario_tipo_unique
        unique (proprietario_id, tipo_natureza);
  end if;
end $$;

