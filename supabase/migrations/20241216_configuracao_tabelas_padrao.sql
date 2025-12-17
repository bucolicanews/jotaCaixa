-- Tabela para armazenar versões padrão de plano de contas e históricos
create table if not exists public.configuracao_tabelas_padrao (
    id bigserial primary key,
    created_at timestamptz not null default timezone('utc', now()),
    plano_de_contas jsonb,
    historicos jsonb,
    id_admin uuid not null references public.tbl_admins(id) on delete cascade
);

create index if not exists configuracao_tabelas_padrao_admin_idx
    on public.configuracao_tabelas_padrao (id_admin, created_at desc);

alter table public.configuracao_tabelas_padrao enable row level security;

-- Política única permitindo que o Admin autenticado gerencie apenas os próprios registros
create policy "Admins gerenciam suas tabelas padrão"
    on public.configuracao_tabelas_padrao
    for all
    using (auth.uid() = id_admin)
    with check (auth.uid() = id_admin);
