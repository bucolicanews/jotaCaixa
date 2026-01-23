-- Migration: Criar triggers de auditoria para conciliação
-- Data: 2026-01-23
-- Descrição: Sistema de auditoria para rastrear operações de vinculação entre extratos e parcelas

-- ============================================================
-- 1. Criar tabela de auditoria (se não existir)
-- ============================================================
CREATE TABLE IF NOT EXISTS auditoria_conciliacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tabela_origem VARCHAR(50) NOT NULL,
    registro_id UUID NOT NULL,
    operacao VARCHAR(10) NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
    dados_antigos JSONB,
    dados_novos JSONB,
    usuario_id UUID REFERENCES auth.users(id),
    data_operacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    empresa_id UUID NOT NULL,
    observacao TEXT
);

-- Criar índices para auditoria
CREATE INDEX IF NOT EXISTS idx_auditoria_conciliacao_tabela 
ON auditoria_conciliacao(tabela_origem);

CREATE INDEX IF NOT EXISTS idx_auditoria_conciliacao_registro 
ON auditoria_conciliacao(registro_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_conciliacao_operacao 
ON auditoria_conciliacao(operacao);

CREATE INDEX IF NOT EXISTS idx_auditoria_conciliacao_data 
ON auditoria_conciliacao(data_operacao DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_conciliacao_empresa 
ON auditoria_conciliacao(empresa_id);

-- Habilitar RLS na tabela de auditoria
ALTER TABLE auditoria_conciliacao ENABLE ROW LEVEL SECURITY;

-- Política RLS para auditoria (somente leitura)
DROP POLICY IF EXISTS "Usuários podem visualizar auditoria de sua empresa" ON auditoria_conciliacao;
CREATE POLICY "Usuários podem visualizar auditoria de sua empresa"
ON auditoria_conciliacao
FOR SELECT
USING (
    empresa_id IN (
        SELECT empresa_id FROM usuarios_empresas WHERE user_id = auth.uid()
    )
);

-- ============================================================
-- 2. Criar função de auditoria
-- ============================================================
CREATE OR REPLACE FUNCTION registrar_auditoria_conciliacao()
RETURNS TRIGGER AS $$
BEGIN
    -- Para INSERT
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO auditoria_conciliacao (
            tabela_origem,
            registro_id,
            operacao,
            dados_antigos,
            dados_novos,
            usuario_id,
            empresa_id,
            observacao
        ) VALUES (
            TG_TABLE_NAME,
            NEW.id,
            'INSERT',
            NULL,
            row_to_json(NEW)::JSONB,
            COALESCE(NEW.usuario_vinculacao_id, auth.uid()),
            NEW.empresa_id,
            'Novo vínculo criado'
        );
        RETURN NEW;
    
    -- Para UPDATE
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO auditoria_conciliacao (
            tabela_origem,
            registro_id,
            operacao,
            dados_antigos,
            dados_novos,
            usuario_id,
            empresa_id,
            observacao
        ) VALUES (
            TG_TABLE_NAME,
            NEW.id,
            'UPDATE',
            row_to_json(OLD)::JSONB,
            row_to_json(NEW)::JSONB,
            COALESCE(NEW.usuario_vinculacao_id, auth.uid()),
            NEW.empresa_id,
            'Vínculo atualizado'
        );
        RETURN NEW;
    
    -- Para DELETE
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO auditoria_conciliacao (
            tabela_origem,
            registro_id,
            operacao,
            dados_antigos,
            dados_novos,
            usuario_id,
            empresa_id,
            observacao
        ) VALUES (
            TG_TABLE_NAME,
            OLD.id,
            'DELETE',
            row_to_json(OLD)::JSONB,
            NULL,
            auth.uid(),
            OLD.empresa_id,
            'Vínculo removido'
        );
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Criar triggers na tabela extrato_parcela_vinculo
-- ============================================================
DROP TRIGGER IF EXISTS trigger_auditoria_vinculo_insert ON extrato_parcela_vinculo;
CREATE TRIGGER trigger_auditoria_vinculo_insert
    AFTER INSERT ON extrato_parcela_vinculo
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria_conciliacao();

DROP TRIGGER IF EXISTS trigger_auditoria_vinculo_update ON extrato_parcela_vinculo;
CREATE TRIGGER trigger_auditoria_vinculo_update
    AFTER UPDATE ON extrato_parcela_vinculo
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria_conciliacao();

DROP TRIGGER IF EXISTS trigger_auditoria_vinculo_delete ON extrato_parcela_vinculo;
CREATE TRIGGER trigger_auditoria_vinculo_delete
    AFTER DELETE ON extrato_parcela_vinculo
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria_conciliacao();

-- ============================================================
-- 4. Criar triggers na tabela conciliacao_lancamentos_avulsos
-- ============================================================
DROP TRIGGER IF EXISTS trigger_auditoria_lancamento_avulso_insert ON conciliacao_lancamentos_avulsos;
CREATE TRIGGER trigger_auditoria_lancamento_avulso_insert
    AFTER INSERT ON conciliacao_lancamentos_avulsos
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria_conciliacao();

DROP TRIGGER IF EXISTS trigger_auditoria_lancamento_avulso_update ON conciliacao_lancamentos_avulsos;
CREATE TRIGGER trigger_auditoria_lancamento_avulso_update
    AFTER UPDATE ON conciliacao_lancamentos_avulsos
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria_conciliacao();

DROP TRIGGER IF EXISTS trigger_auditoria_lancamento_avulso_delete ON conciliacao_lancamentos_avulsos;
CREATE TRIGGER trigger_auditoria_lancamento_avulso_delete
    AFTER DELETE ON conciliacao_lancamentos_avulsos
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria_conciliacao();

-- ============================================================
-- 5. Comentários para documentação
-- ============================================================
COMMENT ON TABLE auditoria_conciliacao IS 'Tabela de auditoria para operações de conciliação bancária';
COMMENT ON COLUMN auditoria_conciliacao.tabela_origem IS 'Nome da tabela onde ocorreu a operação';
COMMENT ON COLUMN auditoria_conciliacao.registro_id IS 'ID do registro afetado';
COMMENT ON COLUMN auditoria_conciliacao.operacao IS 'Tipo de operação: INSERT, UPDATE ou DELETE';
COMMENT ON COLUMN auditoria_conciliacao.dados_antigos IS 'Estado anterior do registro (JSON)';
COMMENT ON COLUMN auditoria_conciliacao.dados_novos IS 'Estado novo do registro (JSON)';
COMMENT ON COLUMN auditoria_conciliacao.usuario_id IS 'Usuário que realizou a operação';
COMMENT ON COLUMN auditoria_conciliacao.data_operacao IS 'Data e hora da operação';
COMMENT ON COLUMN auditoria_conciliacao.empresa_id IS 'ID da empresa (para RLS)';

COMMENT ON FUNCTION registrar_auditoria_conciliacao() IS 'Função trigger para registrar operações de auditoria em conciliação';
