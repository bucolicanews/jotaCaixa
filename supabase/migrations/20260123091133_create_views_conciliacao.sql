-- Migration: Criar views para relatórios de conciliação
-- Data: 2026-01-23
-- Descrição: Views para facilitar consultas e relatórios de conciliação bancária

-- ============================================================
-- 1. DROP views existentes (se houver)
-- ============================================================
DROP VIEW IF EXISTS vw_extrato_conciliacao;
DROP VIEW IF EXISTS vw_parcelas_vinculadas;

-- ============================================================
-- 2. VIEW: vw_extrato_conciliacao
-- Agrupa extratos com resumo de vínculos e calcula valores
-- ============================================================
CREATE OR REPLACE VIEW vw_extrato_conciliacao AS
SELECT 
    e.id AS extrato_id,
    e.empresa_id,
    e.data,
    e.descricao,
    e.valor,
    e.tipo,
    e.status_conciliacao,
    e.valor_conciliado,
    (e.valor - COALESCE(e.valor_conciliado, 0)) AS valor_pendente,
    COUNT(DISTINCT v.id) AS total_vinculos,
    COUNT(DISTINCT CASE WHEN v.tipo_parcela = 'CR' THEN v.id END) AS vinculos_cr,
    COUNT(DISTINCT CASE WHEN v.tipo_parcela = 'CP' THEN v.id END) AS vinculos_cp,
    COUNT(DISTINCT la.id) AS total_lancamentos_avulsos,
    COALESCE(SUM(v.valor_aplicado), 0) AS valor_vinculado_parcelas,
    COALESCE(SUM(la.valor), 0) AS valor_vinculado_avulsos,
    e.created_at,
    e.updated_at
FROM extratos e
LEFT JOIN extrato_parcela_vinculo v ON e.id = v.transacao_extrato_id
LEFT JOIN conciliacao_lancamentos_avulsos la ON e.id = la.transacao_extrato_id
GROUP BY 
    e.id,
    e.empresa_id,
    e.data,
    e.descricao,
    e.valor,
    e.tipo,
    e.status_conciliacao,
    e.valor_conciliado,
    e.created_at,
    e.updated_at;

-- ============================================================
-- 3. VIEW: vw_parcelas_vinculadas
-- Lista todas as parcelas com seus vínculos de extrato
-- ============================================================
CREATE OR REPLACE VIEW vw_parcelas_vinculadas AS
-- Parcelas CR (Admin)
SELECT 
    v.id AS vinculo_id,
    v.transacao_extrato_id,
    v.parcela_id,
    v.tipo_parcela,
    v.valor_aplicado,
    v.data_vinculacao,
    v.usuario_vinculacao_id,
    v.observacao,
    v.empresa_id,
    e.data AS data_extrato,
    e.descricao AS descricao_extrato,
    e.valor AS valor_extrato,
    e.tipo AS tipo_extrato,
    apr.valor_parcela,
    apr.data_vencimento,
    apr.status AS status_parcela,
    apr.numero_parcela,
    'admin_parcelas_receber'::TEXT AS tabela_origem
FROM extrato_parcela_vinculo v
INNER JOIN extratos e ON v.transacao_extrato_id = e.id
LEFT JOIN admin_parcelas_receber apr ON v.parcela_id = apr.id
WHERE v.tipo_parcela = 'CR'

UNION ALL

-- Parcelas CR (Cliente)
SELECT 
    v.id AS vinculo_id,
    v.transacao_extrato_id,
    v.parcela_id,
    v.tipo_parcela,
    v.valor_aplicado,
    v.data_vinculacao,
    v.usuario_vinculacao_id,
    v.observacao,
    v.empresa_id,
    e.data AS data_extrato,
    e.descricao AS descricao_extrato,
    e.valor AS valor_extrato,
    e.tipo AS tipo_extrato,
    pcr.valor_parcela,
    pcr.data_vencimento,
    pcr.status AS status_parcela,
    pcr.numero_parcela,
    'parcelas_contas_receber'::TEXT AS tabela_origem
FROM extrato_parcela_vinculo v
INNER JOIN extratos e ON v.transacao_extrato_id = e.id
LEFT JOIN parcelas_contas_receber pcr ON v.parcela_id = pcr.id
WHERE v.tipo_parcela = 'CR'

UNION ALL

-- Parcelas CP (Admin)
SELECT 
    v.id AS vinculo_id,
    v.transacao_extrato_id,
    v.parcela_id,
    v.tipo_parcela,
    v.valor_aplicado,
    v.data_vinculacao,
    v.usuario_vinculacao_id,
    v.observacao,
    v.empresa_id,
    e.data AS data_extrato,
    e.descricao AS descricao_extrato,
    e.valor AS valor_extrato,
    e.tipo AS tipo_extrato,
    app.valor_parcela,
    app.data_vencimento,
    app.status AS status_parcela,
    app.numero_parcela,
    'admin_parcelas_pagar'::TEXT AS tabela_origem
FROM extrato_parcela_vinculo v
INNER JOIN extratos e ON v.transacao_extrato_id = e.id
LEFT JOIN admin_parcelas_pagar app ON v.parcela_id = app.id
WHERE v.tipo_parcela = 'CP'

UNION ALL

-- Parcelas CP (Cliente)
SELECT 
    v.id AS vinculo_id,
    v.transacao_extrato_id,
    v.parcela_id,
    v.tipo_parcela,
    v.valor_aplicado,
    v.data_vinculacao,
    v.usuario_vinculacao_id,
    v.observacao,
    v.empresa_id,
    e.data AS data_extrato,
    e.descricao AS descricao_extrato,
    e.valor AS valor_extrato,
    e.tipo AS tipo_extrato,
    pcp.valor_parcela,
    pcp.data_vencimento,
    pcp.status AS status_parcela,
    pcp.numero_parcela,
    'parcelas_contas_pagar'::TEXT AS tabela_origem
FROM extrato_parcela_vinculo v
INNER JOIN extratos e ON v.transacao_extrato_id = e.id
LEFT JOIN parcelas_contas_pagar pcp ON v.parcela_id = pcp.id
WHERE v.tipo_parcela = 'CP';

-- ============================================================
-- 4. Comentários para documentação
-- ============================================================
COMMENT ON VIEW vw_extrato_conciliacao IS 'View agregada de extratos com resumo de vínculos e valores de conciliação';
COMMENT ON VIEW vw_parcelas_vinculadas IS 'View unificada de todas as parcelas vinculadas a extratos (CR e CP, Admin e Cliente)';
