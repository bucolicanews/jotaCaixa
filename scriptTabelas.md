//// TABELA ADMIN    tbl_admins
-- Tabela para armazenar o perfil detalhado do Administrador ou da Empresa Principal
CREATE TABLE IF NOT EXISTS public.tbl_admins (
    id uuid PRIMARY KEY, -- Recomenda-se ligar ao 'auth.users.id'
    nome text NOT NULL,
    email text UNIQUE NOT NULL,

    -- Dados de PJ/PF
    cpf text,
    cnpj text,
    rg text,
    
    -- Dados de Endereço
    telefone text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    
    -- Dados de Imagem/Documentos
    avatar_url text,
    logo_url text,
    assinatura_proprietario_nome text,
    assinatura_proprietario_url text,
    
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

///// TABELA CLIENTES  tbl_clientes

-- Tabela para armazenar o perfil detalhado dos Clientes (Sub-Contas)
CREATE TABLE IF NOT EXISTS public.tbl_clientes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL, -- Vínculo com a conta administrativa principal

    -- Dados de Identificação
    nome text NOT NULL, -- Nome do Contato Principal ou Fantasia
    razao_social text,
    nome_fantasia text,
    documento text, -- CPF ou CNPJ
    cnpj text,
    email text UNIQUE NOT NULL, -- <-- CORRIGIDO AQUI: apenas NOT NULL
    tipo_cliente text, -- Ex: 'PF', 'PJ', 'Interno'
    
    -- Permissões e Acessos
    aprovado boolean DEFAULT FALSE NOT NULL,
    permissoes jsonb,
    limite_usuarios integer,
    plano_id uuid,
    data_fim_acesso timestamp with time zone,
    
    -- Dados de Endereço (semelhante ao Admin)
    telefone text,
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    
    -- Timestamps e URLs
    avatar_url text,
    logo_url text,
    assinatura_proprietario_nome text,
    assinatura_proprietario_url text,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// USUARIOS

-- Tabela para armazenar usuários individuais que pertencem a um cliente específico
CREATE TABLE IF NOT EXISTS public.tbl_usuarios (
    id uuid PRIMARY KEY, -- Recomenda-se ligar ao 'auth.users.id'
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL, -- Vínculo obrigatório com o Cliente

    nome text NOT NULL,
    email text UNIQUE NOT NULL,
    
    -- Dados Pessoais
    cpf text,
    rg text,
    nome_mae text,
    nome_pai text,
    telefone text,
    
    -- Dados de Endereço
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    
    -- Dados de Contrato/Trabalho
    salario numeric,
    horas_semanais integer,
    horas_mensais integer,
    data_inicio_contrato date,
    data_fim_contrato date,
    dias_folga_fixos text[], -- ARRAY para dias como {'Segunda', 'Quarta'}
    folga_domingo_obrigatoria boolean DEFAULT FALSE,
    
    -- Documentos (URLS) e Outros
    permissoes jsonb,
    avatar_url text,
    
    -- Documentos (URLs)
    rg_url text,
    cpf_url text,
    titulo_eleitor_url text,
    ctps_url text,
    certidoes_filhos_urls jsonb, -- Ex: JSON de URLs de certidões de nascimento dos filhos
    
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

/// ADMIN CONTAS PAGAR admin_contas_pagar

-- Tabela mestre para Contas a Pagar (o título)
CREATE TABLE IF NOT EXISTS public.admin_contas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL, -- Admin que cadastrou

    -- Dados do Título
    fornecedor text NOT NULL,
    documento text,
    data_vencimento date NOT NULL,
    valor_total numeric NOT NULL,
    status text NOT NULL DEFAULT 'pendente', -- Ex: 'pendente', 'pago', 'cancelado'
    
    -- Detalhes
    conta_id uuid, -- Conta de débito (pode ser outra tabela 'contas_bancarias')
    descricao text,
    origem text,
    
    -- Vínculos Contábeis
    id_conta_patrimonial uuid,
    id_conta_resultado uuid,
    historico_id uuid,
    
    -- Timestamps (Reutilizando a função de update)
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- Ativar o trigger de 'updated_at' (se você o criou no passo anterior)
-- CREATE TRIGGER update_admin_contas_pagar_updated_at BEFORE UPDATE ON public.admin_contas_pagar FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

//// ADMIN CONTAS A RECEBER
-- Tabela mestre para Contas a Receber (o título)
CREATE TABLE IF NOT EXISTS public.admin_contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL, -- Admin que cadastrou
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL, -- Cliente devedor

    -- Dados do Título
    origem text,
    descricao text,
    valor_total numeric NOT NULL,
    data_emissao date NOT NULL,
    data_vencimento date NOT NULL,
    status text NOT NULL DEFAULT 'pendente', -- Ex: 'pendente', 'recebido', 'cancelado'
    tipo_receita text, -- Ex: 'Serviço', 'Venda', 'Aluguel'
    
    -- Vínculos
    contrato_gerado_id uuid,
    
    -- Vínculos Contábeis
    id_conta_patrimonial uuid,
    id_conta_resultado uuid,
    historico_id uuid,
    
    -- Timestamps
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Ativar o trigger de 'updated_at' (se você o criou no passo anterior)
-- CREATE TRIGGER update_admin_contas_receber_updated_at BEFORE UPDATE ON public.admin_contas_receber FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

//// ADMIN PARCELAS A PAGAR
-- Tabela para detalhar as parcelas de um Título a Pagar
CREATE TABLE IF NOT EXISTS public.admin_parcelas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_pagar_id uuid REFERENCES public.admin_contas_pagar (id) NOT NULL, -- Vínculo com o Título
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    numero_parcela integer NOT NULL,
    valor_parcela numeric NOT NULL,
    valor_pago numeric DEFAULT 0,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status text NOT NULL DEFAULT 'pendente',
    observacao text,
    
    -- Contabilidade
    id_conta_contabil uuid,
    mapeado_extrato_id uuid, -- ID do extrato mapeado para esta parcela (vínculo 1:1)
    
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

//// ADMIN PAGAMENTOS

-- Tabela para registrar a transação de pagamento de uma parcela (Registro de Baixa)
CREATE TABLE IF NOT EXISTS public.admin_pagamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcela_id uuid REFERENCES public.admin_parcelas_pagar (id) NOT NULL, -- Vínculo com a parcela paga
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    valor_pago numeric NOT NULL,
    tipo_pagamento text, -- Ex: 'Total', 'Parcial'
    data_pagamento timestamp with time zone DEFAULT now() NOT NULL,
    forma_pagamento text, -- Ex: 'PIX', 'Boleto', 'TED'
    conta_id uuid, -- Conta bancária de onde o dinheiro saiu (Outra tabela 'contas_bancarias')
    
    observacao text,
    anexo_url text, -- Ex: Imagem do boleto pago
    comprovante_url text, -- Ex: Comprovante de PIX/TED
    
    -- Contabilidade
    id_conta_contabil uuid,
    id_conta_resultado uuid,
    historico_id uuid,
    saldo_contas_id numeric, -- Não está claro o que é 'saldo_contas_id' numérico, mantive o tipo.
    
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

///// ADMIN CONTAS A RECEBER

-- 3. Tabela mestre para Contas a Receber (o título)
CREATE TABLE IF NOT EXISTS public.admin_contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL, -- Admin que cadastrou
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL, -- Cliente devedor

    origem text,
    descricao text,
    valor_total numeric NOT NULL,
    data_emissao date NOT NULL,
    data_vencimento date NOT NULL,
    status text NOT NULL DEFAULT 'pendente', 
    tipo_receita text, 
    contrato_gerado_id uuid,
    
    id_conta_patrimonial uuid,
    id_conta_resultado uuid,
    historico_id uuid,
    
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

//// ADMIN PARCELAS RECEBER

-- 4. Tabela para detalhar as parcelas de um Título a Receber
CREATE TABLE IF NOT EXISTS public.admin_parcelas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_receber_id uuid REFERENCES public.admin_contas_receber (id) NOT NULL, -- Vínculo com o Título
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    numero_parcela integer NOT NULL,
    valor_parcela numeric NOT NULL,
    valor_pago numeric DEFAULT 0,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status text NOT NULL DEFAULT 'pendente',
    observacao text,
    
    id_conta_contabil uuid,
    ciente_cliente boolean DEFAULT FALSE,
    mapeado_extrato_id uuid, -- ID do extrato mapeado para esta parcela (vínculo 1:1)
    
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

//// ADMIN RECEBIMENTOS

-- 5. Tabela para registrar a transação de recebimento de uma parcela (Registro de Baixa)
CREATE TABLE IF NOT EXISTS public.admin_recebimentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcela_id uuid REFERENCES public.admin_parcelas_receber (id) NOT NULL, -- Vínculo com a parcela recebida
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL,

    valor_recebido numeric NOT NULL,
    tipo_recebimento text, -- Ex: 'Total', 'Parcial', 'Atraso'
    desconto_aplicado numeric DEFAULT 0,
    data_recebimento timestamp with time zone DEFAULT now() NOT NULL,
    forma_pagamento text, -- Ex: 'PIX', 'Boleto', 'Cartão'
    conta_id uuid, -- Conta bancária de destino
    
    observacao text,
    anexo_url text, -- Ex: anexo da fatura
    comprovante_url text, -- Ex: Comprovante de recebimento
    
    -- Contabilidade
    id_conta_contabil uuid,
    id_conta_resultado uuid,
    historico_id uuid,
    
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

//// ANEXO
-- Tabela para gerenciar metadados de anexos
CREATE TABLE IF NOT EXISTS public.anexos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL, -- Assumindo que a empresa_id é o Admin principal

    nome_arquivo text NOT NULL,
    tipo_mime text,
    url_armazenamento text NOT NULL, -- Onde o arquivo realmente está no Storage
    metadados jsonb,
    
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// BLOCO SOCIETÁRIO
-- Tabela para armazenar blocos de texto ou conteúdo societário/legal
CREATE TABLE IF NOT EXISTS public.blocos_societarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL, -- Proprietário ou Admin que criou o bloco

    titulo text NOT NULL,
    conteudo text,
    tipo_bloco text,
    
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

 ///// CLIENTES

-- Tabela de Clientes (versão simplificada ou auxiliar)
CREATE TABLE IF NOT EXISTS public.clientes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL, -- O Admin que gerencia este cliente

    -- Dados de Identificação
    nome text NOT NULL,
    documento text, -- CPF ou CNPJ
    email text UNIQUE,
    razao_social text,
    nome_fantasia text,
    cpf text,
    cnpj text,
    rg text,
    data_nascimento date,
    
    -- Contato
    telefone text,
    telefone_fixo text,
    
    -- Endereço
    cep text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    
    -- Outros
    is_system_client boolean DEFAULT FALSE,
    logo_url text,
    nome_proprietario text,
    anexo_url text, -- Parece ser a URL de um anexo direto
    
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Adicionando trigger para updated_at (se não foi criado genericamente)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clientes_updated_at
BEFORE UPDATE ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/// CONFIGURAÇÃO CONCILIAÇÃO

-- Configurações gerais de importação/mapeamento de extratos por conta
CREATE TABLE IF NOT EXISTS public.configuracao_conciliacao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    id_saldo_contas uuid, -- ID da conta bancária que está sendo configurada (assumindo uma tabela 'saldo_contas')

    nome_configuracao text NOT NULL,
    mapeamento jsonb, -- JSON que define como mapear colunas do extrato (CSV/OFX)
    coluna_tipo_transacao text,
    valor_credito text, -- Nome da coluna que representa o crédito

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

/// CONCILIAÇÃO REGRAS
-- Regras específicas para categorizar transações no extrato
CREATE TABLE IF NOT EXISTS public.conciliacao_regras (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    descricao_extrato text NOT NULL, -- Padrão de texto a ser procurado no extrato
    conta_contabil_id uuid, -- Para qual conta contábil a regra deve mapear
    tipo_lancamento text NOT NULL, -- Ex: 'Receita', 'Despesa', 'Transferencia'

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// CONCILIACAO

-- Registro dos extratos processados e resultados da conciliação
CREATE TABLE IF NOT EXISTS public.conciliacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    usuario_id uuid, -- O usuário ou admin que realizou a conciliação
    id_saldo_contas uuid, -- Conta bancária conciliada

    extrato_hash text UNIQUE NOT NULL, -- Hash do conteúdo do extrato para evitar duplicidade
    nome_arquivo text,
    extrato_json jsonb, -- Cópia dos dados do extrato (original)
    resultado jsonb, -- Resultado detalhado da conciliação (o que foi mapeado/não mapeado)

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// CONFIGURAÇÃO CONTABIL
 -- Configurações gerais de contabilidade (ex: configuração de níveis de contas)
CREATE TABLE IF NOT EXISTS public.configuracao_contabil (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    codigo_nivel_1 text NOT NULL, -- Ex: 1.0.0.0 (Ativo), 2.0.0.0 (Passivo), 3.0.0.0 (Receitas)
    tipo_natureza text NOT NULL, -- Ex: 'Ativo', 'Passivo', 'Receita', 'Despesa'

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

/// CONFIGURAÇÃO CONTAS PAGAR

-- Mapeamento de contas a pagar para contas contábeis padrão
CREATE TABLE IF NOT EXISTS public.configuracao_contas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    tipo_registro text UNIQUE NOT NULL, -- Ex: 'Padrão', 'Fornecedor X', 'Despesa Administrativa'
    conta_contabil_id uuid, -- ID da conta contábil de destino padrão (ex: Conta de Despesas)

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// CONFIGURACAO CONTS RECEBER

-- Mapeamento de contas a receber para contas contábeis padrão
CREATE TABLE IF NOT EXISTS public.configuracao_contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    tipo_registro text UNIQUE NOT NULL, -- Ex: 'Padrão', 'Serviço A', 'Mensalidade'
    conta_contabil_id uuid, -- ID da conta contábil de destino padrão (ex: Conta de Receitas)

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// CONFIGURACAO CONTRATOS
-- Configurações de envio e mapeamento contábil para contratos/faturamento
CREATE TABLE IF NOT EXISTS public.configuracao_contratos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    url_base_assinatura text,
    template_whatsapp text,
    template_email text,

    -- Mapeamentos Contábeis para o fluxo de contrato
    id_conta_clientes_receber uuid, -- Conta a ser usada no ativo (Contas a Receber)
    id_conta_receita_contrato uuid, -- Conta de Receita (DRE)

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// CONFIGURACAO HISTORICO PADRÃO
-- Configurações de Histórico Padrão para uso em lançamentos
CREATE TABLE IF NOT EXISTS public.configuracao_historico_padrao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    tipo_registro text UNIQUE NOT NULL, -- Ex: 'Pagamento de Salário', 'Recebimento de Cliente'
    historico_id uuid, -- ID do texto de histórico padronizado (assumindo outra tabela 'historicos')

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// CONFIGURAÇÃO PLANO DE CONTAS
-- Configurações de formatação do Plano de Contas
CREATE TABLE IF NOT EXISTS public.configuracao_plano_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    mascara_codigo text NOT NULL, -- Ex: '9.9.99.999' para definir a estrutura dos códigos contábeis

    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- Gatilho de atualização (se a função `update_updated_at_column` já foi criada)
-- CREATE TRIGGER update_configuracao_plano_contas_updated_at BEFORE UPDATE ON public.configuracao_plano_contas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

//// CONFIGURAÇÃO CALIMA

-- Configurações de exportação/integração com o sistema Calima
CREATE TABLE IF NOT EXISTS public.configuracoes_calima (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    mapeamento jsonb, -- JSON detalhando o mapeamento de campos para o layout do Calima

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// CONFIGURAÇÃO STRIP

-- Configurações de integração e mapeamento contábil para o Stripe (pagamentos)
CREATE TABLE IF NOT EXISTS public.configuracoes_stripe (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    stripe_publishable_key text,
    stripe_secret_key text,

    -- Mapeamentos Contábeis Padrão para transações do Stripe
    conta_sintetica_id uuid,
    conta_receber_id uuid,
    historico_padrao_id uuid,
    id_conta_resultado uuid,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

/// HISTÓRICO
-- Tabela para gerenciar históricos padronizados de lançamentos
CREATE TABLE IF NOT EXISTS public.historicos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    codigo text UNIQUE NOT NULL, -- Código do histórico (ex: 1.0.01)
    descricao text NOT NULL,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

/// CONTAS PAGAR

-- 1. Tabela mestre para Títulos a Pagar
CREATE TABLE IF NOT EXISTS public.contas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    fornecedor text NOT NULL,
    documento text,
    data_vencimento date NOT NULL,
    valor_total numeric NOT NULL,
    status text NOT NULL DEFAULT 'pendente',

    descricao text,
    origem text,
    conta_id uuid REFERENCES public.saldo_contas (id),
    anexo_id uuid,

    conta_contabil_id uuid,
    historico_id uuid REFERENCES public.historicos (id),
    id_conta_patrimonial uuid,
    id_conta_resultado uuid,

    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);
/// CONTAS RECEBER

-- Tabela mestre para Títulos a Receber
CREATE TABLE IF NOT EXISTS public.contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL,

    -- Dados do Título
    origem text,
    descricao text,
    valor_total numeric NOT NULL,
    data_emissao date NOT NULL,
    data_vencimento date NOT NULL,
    status text NOT NULL DEFAULT 'pendente', -- 'pendente', 'recebido', 'parcialmente_recebido', 'cancelado'
    tipo_receita text,

    -- Recorrência/Contrato
    intervalo_recorrencia text, -- Ex: 'Mensal', 'Bimestral'
    contrato_id uuid, -- Referência à tabela 'contratos' (Modelo)
    contrato_gerado_id uuid, -- Referência à tabela 'contratos_gerados' (Instância)

    observacoes text,

    -- Mapeamento Contábil
    historico_id uuid REFERENCES public.historicos (id),
    id_conta_resultado uuid,
    id_conta_patrimonial uuid,

    -- Timestamps
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

//// CONTRATO MODELO

-- Tabela para armazenar modelos de contrato reutilizáveis
CREATE TABLE IF NOT EXISTS public.contrato_modelos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    titulo text NOT NULL,
    conteudo_template text NOT NULL, -- O conteúdo do contrato com tags/variáveis

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// CONTRATO TAGS

-- Dicionário de tags que podem ser usadas nos modelos de contrato
CREATE TABLE IF NOT EXISTS public.contrato_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    nome_tag text UNIQUE NOT NULL, -- Ex: {{cliente_nome}}, {{valor_total}}
    descricao text,
    origem_dado text, -- Ex: 'tbl_clientes', 'contratos_gerados'

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
//// CONTRATOS
-- Tabela para gerenciar contratos de recorrência de faturamento
CREATE TABLE IF NOT EXISTS public.contratos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL,

    descricao text,
    valor_total numeric NOT NULL,
    data_inicio date NOT NULL,
    data_fim date,

    status text NOT NULL DEFAULT 'ativo', -- 'ativo', 'suspenso', 'encerrado'
    tipo_recorrencia text NOT NULL, -- Ex: 'mensal', 'trimestral'
    dia_vencimento integer, -- Dia do mês para faturamento (ex: 5, 10, 15)

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

//// CONTRATO GERADO

-- Tabela para armazenar instâncias de contratos gerados a partir de modelos (para assinatura)
CREATE TABLE IF NOT EXISTS public.contratos_gerados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL,
    modelo_id uuid REFERENCES public.contrato_modelos (id),

    status text NOT NULL DEFAULT 'rascunho', -- 'aguardando_assinatura', 'assinado', 'expirado'
    valor_total numeric,
    data_inicio date,
    numero_parcelas integer,
    dia_vencimento_parcela integer,

    -- Dados do Documento
    valores_tags_preenchidos jsonb,
    conteudo_renderizado text,
    link_assinatura_externo text,
    documento_assinado_url text,

    -- Assinaturas
    assinatura_nome text,
    assinatura_selfie_url text,
    assinatura_proprietario_nome text,
    assinatura_proprietario_url text,

    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// DESCRICAOIDO EXTRATO

-- Tabela auxiliar para mapear textos de extrato (similar a admin_descricao_extrato)
CREATE TABLE IF NOT EXISTS public.descricao_extrato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    descricao text NOT NULL, -- Ex: 'Pgto Salários'
    status boolean DEFAULT TRUE,
    ordem integer,

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

//// DOCUMENTOS SOCIETARIOS GERADOS
-- Tabela para gerenciar documentos legais gerados para o cliente (ex: Alteração Contratual)
CREATE TABLE IF NOT EXISTS public.documentos_societarios_gerados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    cliente_id uuid REFERENCES public.tbl_clientes (id) NOT NULL,
    modelo_id uuid, -- ID do modelo base (pode ser da tabela 'blocos_societarios' ou similar)

    status text NOT NULL DEFAULT 'rascunho',
    valores_tags_preenchidos jsonb,
    conteudo_renderizado text,
    data_registro date,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// EXTRATOS

-- Tabela de Extratos Bancários (transações brutas)
CREATE TYPE public.status_mapeamento_extrato AS ENUM (
    'pendente_mapeamento',
    'mapeado_automatico',
    'mapeado_manual',
    'sem_mapeamento'
);

CREATE TABLE IF NOT EXISTS public.extratos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    id_saldo_contas uuid, -- ID da conta bancária de origem/destino

    data date NOT NULL,
    descricao text NOT NULL,
    valor numeric NOT NULL,
    tipo text NOT NULL, -- 'C' (Crédito) ou 'D' (Débito)
    identificacao text,
    conciliado boolean DEFAULT FALSE,

    -- Mapeamento
    conta_contabil_id uuid,
    status_mapeamento public.status_mapeamento_extrato NOT NULL DEFAULT 'pendente_mapeamento',
    mapeado_parcela_id uuid, -- ID da parcela (pagar/receber) com a qual foi conciliado
    mapeado_tipo text, -- Ex: 'contas_pagar', 'contas_receber', 'lancamento_manual'

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

/// FERIAS

-- Tabela para registro de períodos de férias dos funcionários
CREATE TABLE IF NOT EXISTS public.ferias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL, -- Assumindo que 'tbl_usuarios' são os funcionários

    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    periodo_referencia text, -- Ex: '2023/2024'

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

/// HISTORICO AUDITORIA

-- Tabela para rastrear alterações importantes no sistema
CREATE TABLE IF NOT EXISTS public.historico_auditoria (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    usuario_id uuid, -- Usuário que realizou a ação

    acao text NOT NULL, -- Ex: 'INSERT', 'UPDATE', 'DELETE'
    tabela_afetada text NOT NULL,
    registro_id uuid, -- ID do registro afetado

    dados_antigos jsonb,
    dados_novos jsonb,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// INDENTIFICACAO DO EXTRATO

-- Tabela auxiliar para identificar tipos de transação no extrato
CREATE TABLE IF NOT EXISTS public.identificacao_extrato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    descricao text NOT NULL, -- Padrão de identificação (ex: 'SALDO INICIAL', 'TARIFA')
    status boolean DEFAULT TRUE,
    ordem integer,

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

/// LANÇAMENTOS
-- Tabela para lançamentos contábeis ou financeiros manuais (Caixa, Bancos)
CREATE TABLE IF NOT EXISTS public.lancamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    data_movimentacao date NOT NULL,
    descricao text NOT NULL,
    valor numeric NOT NULL,
    tipo text NOT NULL, -- 'C' (Crédito) ou 'D' (Débito)

    -- Vínculos
    conta_bancaria_id uuid,
    conta_contabil_id uuid,
    historico_id uuid REFERENCES public.historicos (id),
    conta_resultado_id uuid,

    -- Documentação
    conciliado boolean DEFAULT FALSE,
    origem text, -- Ex: 'Manual', 'Extrato', 'ContasPagar'
    documento text,
    anexo_id uuid,

    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

///// TICKETS

-- Tabela mestre para Chamados de Suporte/Serviço
CREATE TABLE IF NOT EXISTS public.tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL, -- O administrador que gerencia o ticket
    empresa_id uuid, -- ID da empresa/cliente que abriu o ticket (se for um sistema B2B)

    titulo text NOT NULL,
    status text NOT NULL DEFAULT 'aberto', -- Ex: 'aberto', 'em_progresso', 'fechado'
    prioridade text, -- Ex: 'baixa', 'media', 'alta'

    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// MENSAGEM TICKETS

-- Tabela para o histórico de mensagens dentro de um ticket
CREATE TABLE IF NOT EXISTS public.mensagens_ticket (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid REFERENCES public.tickets (id) NOT NULL,

    remetente_id uuid NOT NULL, -- ID do usuário (admin ou cliente) que enviou a mensagem
    destinatario_id uuid, -- ID do usuário (admin ou cliente) de destino (opcional)

    conteudo text NOT NULL,
    anexo_url text, -- URL para um anexo (pode ser ligada à tabela `anexos`)

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

///// MODELOS SOCIETARIOS

-- Tabela para modelos de documentos societários (contrato social, alteracoes, atas)
CREATE TABLE IF NOT EXISTS public.modelos_societarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    titulo text NOT NULL,
    conteudo_template text NOT NULL, -- Conteúdo do modelo com tags
    tipo_documento text, -- Ex: 'Contrato Social', 'Ata', 'Procuracao'
    tipo_conteudo text, -- Ex: 'HTML', 'Markdown', 'DOCX'

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);
//// MODELOS SOCIETARIOS

-- Tabela para gerenciar contas de Caixa e Bancos
CREATE TABLE IF NOT EXISTS public.saldo_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    nome text NOT NULL, -- Ex: 'Caixa Geral', 'Banco Itaú C/C'
    saldo_inicial numeric DEFAULT 0 NOT NULL,

    tipo_saldo text, -- Ex: 'Caixa', 'Banco', 'Investimento'
    natureza_contabil text, -- Ex: 'Ativo Circulante'
    conta_contabil_id uuid, -- ID da conta contábil analítica (se houver)

    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// SALDO CONTAS

-- Tabela para gerenciar contas de Caixa e Bancos
CREATE TABLE IF NOT EXISTS public.saldo_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    nome text NOT NULL, -- Ex: 'Caixa Geral', 'Banco Itaú C/C'
    saldo_inicial numeric DEFAULT 0 NOT NULL,

    tipo_saldo text, -- Ex: 'Caixa', 'Banco', 'Investimento'
    natureza_contabil text, -- Ex: 'Ativo Circulante'
    conta_contabil_id uuid, -- ID da conta contábil analítica (se houver)

    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// PAGAMENTOS
-- 3. Tabela para registrar o pagamento de parcelas de contas a pagar (Baixa)
CREATE TABLE IF NOT EXISTS public.pagamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcela_id uuid REFERENCES public.parcelas_contas_pagar (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    valor_pago numeric NOT NULL,
    tipo_pagamento text,
    data_pagamento timestamp with time zone DEFAULT now() NOT NULL,
    forma_pagamento text,

    observacao text,
    anexo_url text,
    comprovante_url text,

    conta_id uuid REFERENCES public.saldo_contas (id),
    id_conta_contabil uuid,
    historico_id uuid REFERENCES public.historicos (id),
    id_conta_resultado uuid,
    saldo_contas_id numeric,

    created_at timestamp with time zone DEFAULT now() NOT NULL
);

//// PARECLAS_CONTAS_PAGAR

-- 2. Detalhamento das parcelas de um Título a Pagar
CREATE TABLE IF NOT EXISTS public.parcelas_contas_pagar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_pagar_id uuid REFERENCES public.contas_pagar (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    numero_parcela integer NOT NULL,
    valor_parcela numeric NOT NULL,
    valor_pago numeric DEFAULT 0,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status text NOT NULL DEFAULT 'pendente',
    observacao text,

    id_conta_contabil uuid,
    mapeado_extrato_id uuid,

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

//// PARCELAS CONTAS A RECEBER

-- Detalhamento das parcelas de um Título a Receber (depende de `contas_receber`)
CREATE TABLE IF NOT EXISTS public.parcelas_contas_receber (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_receber_id uuid REFERENCES public.contas_receber (id) NOT NULL,
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    numero_parcela integer NOT NULL,
    valor_parcela numeric NOT NULL,
    valor_pago numeric DEFAULT 0,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status text NOT NULL DEFAULT 'pendente',
    observacao text,

    id_conta_contabil uuid,
    mapeado_extrato_id uuid, -- ID do extrato (extratos.id) com o qual foi conciliado

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

//// PERIODO AQUISITIVO

-- Tabela para rastrear períodos aquisitivos de férias
CREATE TABLE IF NOT EXISTS public.periodos_aquisitivos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL, -- Depende da tabela `tbl_usuarios`

    data_inicio_aquisitivo date NOT NULL,
    data_fim_aquisitivo date NOT NULL,
    data_limite_concessivo date NOT NULL, -- Data limite para conceder as férias

    dias_direito integer NOT NULL,
    faltas_injustificadas integer DEFAULT 0,
    status text NOT NULL DEFAULT 'em_andamento', -- 'em_andamento', 'concluido', 'perdido'

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// PLANO DE CONTAS

-- Tabela para o Plano de Contas Contábil da empresa
CREATE TABLE IF NOT EXISTS public.plano_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    conta text UNIQUE NOT NULL, -- Código contábil (ex: 1.01.01.001)
    descricao text NOT NULL,
    analitica text, -- Informação se é sintética ou analítica
    codigo_reduzido text,

    -- Flags para identificar o tipo de conta
    is_conta_caixa_banco boolean DEFAULT FALSE,
    is_conta_resultado boolean DEFAULT FALSE,
    is_conta_patrimonial boolean DEFAULT FALSE,
    is_caixa boolean DEFAULT FALSE,
    is_banco boolean DEFAULT FALSE,
    is_a_receber boolean DEFAULT FALSE,
    is_a_pagar boolean DEFAULT FALSE,

    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

/////PLANOS

-- Tabela para gerenciar os Planos de Assinatura oferecidos (serviços)
CREATE TABLE IF NOT EXISTS public.planos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    nome text UNIQUE NOT NULL,
    descricao text,
    preco_mensal numeric NOT NULL,
    permissoes jsonb, -- JSON das funcionalidades liberadas por este plano
    tipo_cliente text, -- Ex: 'Básico', 'Premium', 'Empresarial'
    visivel_vendas boolean DEFAULT TRUE,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

//// RECEBIMENTOS

-- Tabela para registrar o recebimento de parcelas (Baixa)
CREATE TABLE IF NOT EXISTS public.recebimentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcela_id uuid REFERENCES public.parcelas_contas_receber (id) NOT NULL, -- Depende da tabela de parcelas
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    valor_recebido numeric NOT NULL,
    tipo_recebimento text, -- Ex: 'Total', 'Parcial', 'Atraso'
    desconto_aplicado numeric DEFAULT 0,
    data_recebimento timestamp with time zone DEFAULT now() NOT NULL,
    forma_pagamento text, -- Ex: 'PIX', 'Boleto', 'Cartão'

    observacao text,
    anexo_url text,
    comprovante_url text,

    -- Mapeamento Financeiro/Contábil
    conta_id uuid REFERENCES public.saldo_contas (id), -- Conta de destino
    id_conta_resultado uuid,
    historico_id uuid REFERENCES public.historicos (id),

    created_at timestamp with time zone DEFAULT now() NOT NULL
);

//// REGISTROS PLANOS

-- Tabela para registro de ponto dos funcionários (Jornada de Trabalho)
CREATE TABLE IF NOT EXISTS public.registros_ponto (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL, -- Depende de `tbl_usuarios`

    horario_registro timestamp with time zone NOT NULL,
    tipo text NOT NULL, -- Ex: 'Entrada', 'Saída', 'Início Almoço', 'Fim Almoço'
    selfie_url text,

    -- Localização
    latitude numeric,
    longitude numeric,
    maps_url text,

    atestado_url text, -- Se for um registro especial (como atestado médico)
    observacao text,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

/// ADMIN FÉRIAS USER

-- Tabela para registrar a concessão de férias de funcionários
CREATE TABLE IF NOT EXISTS public.admin_ferias_user (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL,
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    periodo_referencia text, -- Ex: '2024/2025' ou ID de `periodos_aquisitivos` (se mapeado)

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- Adicionando índice para consultas rápidas por funcionário e administrador
CREATE INDEX idx_admin_ferias_user_funcionario_admin ON public.admin_ferias_user (funcionario_id, admin_id);
//// ADMIN DESCRIÇÃO EXTRATO
-- Tabela para categorizar e padronizar descrições de extrato bancário.
CREATE TABLE IF NOT EXISTS public.admin_descricao_extrato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    descricao text UNIQUE NOT NULL, -- Ex: 'PGTO SALÁRIO', 'TARIFA BANCÁRIA'
    status boolean DEFAULT TRUE, -- Se a descrição está ativa/válida para mapeamento
    ordem integer, -- Ordem de prioridade ou visualização

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Adicionando índice para consultas rápidas por administrador
CREATE INDEX idx_admin_descricao_extrato_admin_id ON public.admin_descricao_extrato (admin_id);

-- Gatilho de atualização (se a função `update_updated_at_column` já foi criada)
-- CREATE TRIGGER update_admin_descricao_extrato_updated_at
-- BEFORE UPDATE ON public.admin_descricao_extrato
-- FOR EACH ROW
-- EXECUTE FUNCTION update_updated_at_column();

//// ADMIN REGISTRO PONTO

-- Tabela para registrar o ponto eletrônico dos funcionários
CREATE TABLE IF NOT EXISTS public.admin_registros_ponto (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Vínculos
    funcionario_id uuid REFERENCES public.tbl_usuarios (id) NOT NULL,
    admin_id uuid, -- Admin que visualiza/gerencia (opcional, pode ser redundante com empresa_id)
    empresa_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    -- Dados do Registro
    horario_registro timestamp with time zone NOT NULL,
    tipo text NOT NULL, -- Ex: 'Entrada', 'Saída', 'Início Almoço'
    selfie_url text, -- Evidência de autenticidade (URL da foto)

    -- Localização (Geolocalização)
    latitude numeric,
    longitude numeric,
    maps_url text, -- URL do Google Maps para facilitar a visualização

    -- Ocorrências e Documentos
    atestado_url text, -- Anexo para justificar o registro (ex: atestado médico)
    observacao text,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- Adicionando índice para consultas rápidas por funcionário e data
CREATE INDEX idx_admin_registros_ponto_func_data ON public.admin_registros_ponto (funcionario_id, horario_registro DESC);

/// ADMIN IDENTIFICACAO EXTRATO
-- Tabela para rotular ou identificar tipos de transação no extrato
CREATE TABLE IF NOT EXISTS public.admin_identificacao_extrato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES public.tbl_admins (id) NOT NULL,

    descricao text UNIQUE NOT NULL, -- Ex: 'Transferência entre Contas', 'Salário', 'Pagamento de Imposto'
    status boolean DEFAULT TRUE, -- Se a identificação está ativa/válida
    ordem integer, -- Ordem de prioridade ou visualização

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Adicionando índice para consultas rápidas por administrador
CREATE INDEX idx_admin_identificacao_extrato_admin_id ON public.admin_identificacao_extrato (admin_id);

-- Gatilho de atualização (se a função `update_updated_at_column` já foi criada)
-- CREATE TRIGGER update_admin_identificacao_extrato_updated_at
-- BEFORE UPDATE ON public.admin_identificacao_extrato
-- FOR EACH ROW
-- EXECUTE FUNCTION update_updated_at_column();

//////////////////////

HABILITAR O RSL PARA AS TABELAS

-- HABILITAR RLS E CONCEDER PERMISSÕES TOTAIS (GRANT ALL) PARA TODAS AS TABELAS

DO $$
DECLARE
    tabela TEXT;
    tabelas_lista TEXT[] := ARRAY[
        'admin_contas_pagar',
        'admin_contas_receber',
        'admin_descricao_extrato',
        'admin_ferias_user',
        'admin_identificacao_extrato',
        'admin_pagamentos',
        'admin_parcelas_pagar',
        'admin_parcelas_receber',
        'admin_recebimentos',
        'admin_registros_ponto',
        'admin_usuarios',
        'anexos',
        'blocos_societarios',
        'clientes',
        'conciliacao_regras',
        'conciliacoes',
        'configuracao_conciliacao',
        'configuracao_contabil',
        'configuracao_contas_pagar',
        'configuracao_contas_receber',
        'configuracao_contratos',
        'configuracao_historico_padrao',
        'configuracao_plano_contas',
        'configuracoes_calima',
        'configuracoes_stripe',
        'contas_pagar',
        'contas_receber',
        'contrato_modelos',
        'contrato_tags',
        'contratos',
        'contratos_gerados',
        'descricao_extrato',
        'documentos_societarios_gerados',
        'extratos',
        'ferias',
        'historico_auditoria',
        'historicos',
        'identificacao_extrato',
        'lancamentos',
        'mensagens_ticket',
        'modelos_societarios',
        'pagamentos',
        'parcelas_contas_pagar',
        'parcelas_contas_receber',
        'periodos_aquisitivos',
        'plano_contas',
        'planos',
        'recebimentos',
        'registros_ponto',
        'saldo_contas',
        'tbl_admins',
        'tbl_clientes',
        'tbl_usuarios',
        'tickets'
    ];
BEGIN
    FOREACH tabela IN ARRAY tabelas_lista
    LOOP
        -- 1. Habilita Row Level Security (RLS)
        EXECUTE 'ALTER TABLE public.' || quote_ident(tabela) || ' ENABLE ROW LEVEL SECURITY;';

        -- 2. Concede permissões (SELECT, INSERT, UPDATE, DELETE)
        EXECUTE 'GRANT ALL ON public.' || quote_ident(tabela) || ' TO anon, authenticated, service_role;';
    END LOOP;
END
$$; -- Ponto e vírgula crucial ao final do bloco DO $$

//////////////////////////////////////////////////
