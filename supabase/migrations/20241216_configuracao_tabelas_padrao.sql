-- Script para criar a tabela de configuração de tabelas padrão e inserir dados iniciais
-- NOTA: Este script deve ser executado apenas uma vez pelo Admin principal.

CREATE TABLE IF NOT EXISTS public.configuracao_tabelas_padrao (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    plano_de_contas JSONB,
    historicos JSONB,
    id_admin UUID NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.configuracao_tabelas_padrao ENABLE ROW LEVEL SECURITY;

-- Policy: Admins gerenciam suas tabelas padrão
CREATE POLICY "Admins gerenciam suas tabelas padrão" ON public.configuracao_tabelas_padrao
  FOR ALL USING (auth.uid() = id_admin) WITH CHECK (auth.uid() = id_admin);

-- Inserção de dados iniciais (Plano de Contas e Históricos)
-- NOTA: O ID do Admin deve ser substituído pelo ID do primeiro Admin do sistema.
-- Este script é apenas um placeholder para garantir que a tabela exista.

-- Exemplo de inserção (Substitua 'ADMIN_ID_AQUI' pelo ID real do Admin)
-- INSERT INTO public.configuracao_tabelas_padrao (id_admin, plano_de_contas, historicos)
-- VALUES (
--     'ADMIN_ID_AQUI',
--     '[{"Conta": "1", "Código reduzido": "1", "Descrição": "ATIVO", "Analítica": "Não", "is_conta_caixa_banco": false, "is_conta_patrimonial": true, "is_conta_resultado": false, "is_caixa": false, "is_banco": false, "is_a_receber": false, "is_a_pagar": false}, ...]',
--     '[{"Código": "400", "Descrição": "Capital Social"}, ...]'
-- );