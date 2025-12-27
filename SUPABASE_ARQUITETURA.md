-- Função auxiliar para converter strings como 'TRUE', 'FALSE', 'Sim', 'Não' para booleanos
CREATE OR REPLACE FUNCTION public.to_boolean_safe(p_text text)
RETURNS boolean
LANGUAGE sql
AS $$
    SELECT CASE 
        WHEN UPPER(TRIM(p_text)) IN ('TRUE', 'T', 'SIM', '1') THEN TRUE
        ELSE FALSE
    END;
$$;

-- Função para importar tabelas padrão (Plano de Contas e Históricos)
-- ATUALIZADO: Corrigido o formato do string CSV usando dollar-quoting para garantir a integridade dos dados.
CREATE OR REPLACE FUNCTION public.import_default_tables(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    plano_contas_csv text;
    historicos_csv text;
    csv_row text;
    csv_fields text[];
BEGIN
    -- Limpa os dados antigos do proprietário
    DELETE FROM public.plano_contas WHERE proprietario_id = p_proprietario_id;
    DELETE FROM public.historicos WHERE proprietario_id = p_proprietario_id;

    -- Dados do plano_contas_padrao.csv (VERSÃO COMPLETA E FORMATO CORRIGIDO)
    plano_contas_csv := $csv$1;1;ATIVO;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1;11;ATIVO CIRCULANTE;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.01;1101;DISPONIBILIDADES;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.01.0001;11010001;Caixa Matriz;Sim;TRUE;TRUE;FALSE;TRUE;FALSE;FALSE;FALSE
1.1.01.0002;11010002;Bancos Conta Movimento;Sim;TRUE;TRUE;FALSE;FALSE;TRUE;FALSE;FALSE
1.1.01.0003;11010003;Strip;Sim;TRUE;TRUE;FALSE;FALSE;TRUE;FALSE;FALSE
1.1.01.0004;11010004;Aplicações Financeiras;Sim;TRUE;TRUE;FALSE;FALSE;TRUE;FALSE;FALSE
1.1.02;1102;Contas a Receber;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.02.0001;11020001;Clientes Strip a Receber;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;TRUE;FALSE
1.1.02.0002;11020002;Clientes Contratos a Receber;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;TRUE;FALSE
1.1.02.0003;11020003;Clientes a Receber Avulso;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;TRUE;FALSE
1.1.03;1103;Estoques;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.03.0001;11030001;Mercadorias para Revenda;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.1.03.0002;11030002;Materiais de Consumo;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2;12;ATIVO NÃO CIRCULANTE;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.01;1201;Imobilizado;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.01.0001;12010001;Máquinas e Equipamentos;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.01.0002;12010002;Móveis e Utensílios;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.01.0003;12010003;Veículos;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.02;1202;Intangível;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.02.0001;12020001;Softwares;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
1.2.02.0002;12020002;Marcas e Patentes;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2;2;PASSIVO;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1;21;PASSIVO CIRCULANTE;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1.01;2101;Obrigações Trabalhistas;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1.01.0001;21010001;Salários a Pagar;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.1.01.0002;21010002;INSS a Recolher;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.1.02;2102;Obrigações Fiscais;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1.02.0001;21020001;ISS a Recolher;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.1.02.0002;21020002;ICMS a Recolher;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.1.03;2103;Fornecedores;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.1.03.0001;21030001;Fornecedores Nacionais;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
2.2;22;PASSIVO NÃO CIRCULANTE;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.2.01;2201;Empréstimos de Longo Prazo;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
2.2.01.0001;22010001;Financiamentos Bancários;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;TRUE
3;3;PATRIMÔNIO LÍQUIDO;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.1;31;Capital Social;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.1.00.0001;31000001;Capital Integralizado;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.2;32;Reservas de Lucros;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.2.00.0001;32000001;Reserva Legal;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.3;33;Lucros ou Prejuízos Acumulados;Não;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
3.3.00.0001;33000001;Lucros Acumulados;Sim;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE;FALSE
4;4;RECEITA;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1;41;Receita Bruta;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01;4101;Receita de Serviços;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01.0001;41010001;Prestação de Serviços Contabeis;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01.0002;41010002;Receita de Serviços Gedoor;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01.0003;41010003;Receita de serviços de Certificação Digital;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.01.0004;41010004;Receita Serviços Digitais (Strip);Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.02;4102;Receita de Vendas;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.02.0001;41020001;Vendas de Mercadorias;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.03;4103;Estorno desconto concedido;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.1.03.0001;4103001;Receita Estorno do desconto;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2;42;(-)Deduções da Receita;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0001;42010001;(-) ISS sobre Serviços;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0002;42010002;(-) Devoluções de Vendas;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0003;42010003;(-) Custo Serviço Gedoor;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0004;42010004;(-) Custo Serviço Certificado;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.2.01.0005;42010005;(-) Custo do Seviço Strip;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.3.01;43;DESCONTOS OBTIDOS AO PAGAR;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
4.3.01.0001;43010001;Descontos Obtidos ao Pagar;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5;5;DESPESAS;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1;51;Despesas Operacionais;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01;5101;Despesas Administrativas;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01.0001;51010001;Aluguéis;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01.0002;51010002;Água, Luz e Telefone;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01.0003;51010003;Desconto Concedido;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.01.0010;51010010;Despesa com Fornecedores em Geral;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.02;5102;Despesas com Pessoal;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.1.02.0001;51020001;Salários;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.2;52;Despesas Financeiras;Não;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.2.01.0001;52010001;Juros Pagos;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.2.01.0002;52010002;Multas Pagas;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
5.2.01.0003;52010003;Estorno Desconto Obtido;Sim;FALSE;FALSE;TRUE;FALSE;FALSE;FALSE;FALSE
6;6;RESULTADO;Não;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE
6.1;61;Resultado Operacional;Não;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE
6.1.01;6101;Lucro/Prejuizo;Não;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE
6.1.01.0001;61010001;Lucro do exercício;Sim;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE
6.1.01.0002;61010002;Prejuizo do exercício;Sim;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE;FALSE$csv$;

    -- Loop para inserir plano de contas
    FOR csv_row IN SELECT unnest(string_to_array(plano_contas_csv, E'\n'))
    LOOP
        -- Pular linhas vazias que podem ter sido introduzidas
        IF trim(csv_row) <> '' THEN
            csv_fields := string_to_array(csv_row, ';');
            INSERT INTO public.plano_contas (
                proprietario_id, conta, codigo_reduzido, descricao, analitica,
                is_conta_caixa_banco, is_conta_patrimonial, is_conta_resultado, is_caixa, is_banco, is_a_receber, is_a_pagar
            ) VALUES (
                p_proprietario_id, csv_fields[1], csv_fields[2], csv_fields[3], csv_fields[4],
                public.to_boolean_safe(csv_fields[5]), public.to_boolean_safe(csv_fields[6]), public.to_boolean_safe(csv_fields[7]),
                public.to_boolean_safe(csv_fields[8]), public.to_boolean_safe(csv_fields[9]), public.to_boolean_safe(csv_fields[10]), public.to_boolean_safe(csv_fields[11])
            );
        END IF;
    END LOOP;

    -- Dados do historicos_padrao.csv
    historicos_csv := '100;Venda de Mercadorias/Serviços
200;Recebimento de Clientes
300;Pagamento de Fornecedores
400;Integralização de Capital Social
500;Pagamento de Despesas Administrativas
600;Transferência entre Contas';

    -- Loop para inserir históricos
    FOR csv_row IN SELECT unnest(string_to_array(historicos_csv, E'\n'))
    LOOP
        csv_fields := string_to_array(csv_row, ';');
        INSERT INTO public.historicos (proprietario_id, codigo, descricao) 
        VALUES (p_proprietario_id, csv_fields[1], csv_fields[2]);
    END LOOP;

    RETURN QUERY SELECT TRUE, 'Plano de contas e históricos padrão importados com sucesso.'::TEXT;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::text;
END;
$function$;

-- Função RPC para mapear configurações padrão (chamada após importação de plano)
-- ATUALIZADO: Mapeamento da conta de receita ajustado para o novo plano de contas.
CREATE OR REPLACE FUNCTION public.map_default_configs(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_conta_caixa_id UUID;
    v_conta_capital_id UUID;
    v_conta_clientes_id UUID;
    v_conta_fornecedores_id UUID;
    v_conta_receita_id UUID;
    v_conta_despesa_id UUID;
    v_conta_desconto_concedido_id UUID;
    v_conta_estorno_desconto_concedido_id UUID;
    v_conta_desconto_obtido_id UUID;
    v_conta_estorno_desconto_obtido_id UUID;
    v_conta_pagamento_fornecedor_id UUID;
    v_historico_capital_id UUID;
    v_historico_recebimento_id UUID;
    v_historico_pagamento_id UUID;
BEGIN
    -- 1. Busca os IDs das Contas Analíticas Padrão (códigos ajustados para o novo plano)
    SELECT id INTO v_conta_caixa_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '1.1.01.0001' LIMIT 1;
    SELECT id INTO v_conta_capital_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '3.1.00.0001' LIMIT 1;
    SELECT id INTO v_conta_clientes_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '1.1.02.0003' LIMIT 1; -- Clientes a Receber Avulso
    SELECT id INTO v_conta_fornecedores_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '2.1.03.0001' LIMIT 1; -- Fornecedores Nacionais
    SELECT id INTO v_conta_receita_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.1.01.0001' LIMIT 1; -- Prestação de Serviços Contabeis
    SELECT id INTO v_conta_despesa_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0010' LIMIT 1;
    SELECT id INTO v_conta_desconto_concedido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0003' LIMIT 1;
    SELECT id INTO v_conta_estorno_desconto_concedido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.1.03.0001' LIMIT 1;
    SELECT id INTO v_conta_desconto_obtido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '4.3.01.0001' LIMIT 1;
    SELECT id INTO v_conta_estorno_desconto_obtido_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.2.01.0003' LIMIT 1;
    SELECT id INTO v_conta_pagamento_fornecedor_id FROM public.plano_contas WHERE proprietario_id = p_proprietario_id AND conta = '5.1.01.0010' LIMIT 1;
    
    -- 2. Busca os IDs dos Históricos Padrão
    SELECT id INTO v_historico_capital_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '400' LIMIT 1;
    SELECT id INTO v_historico_recebimento_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '200' LIMIT 1;
    SELECT id INTO v_historico_pagamento_id FROM public.historicos WHERE proprietario_id = p_proprietario_id AND codigo = '500' LIMIT 1;

    -- 3. Mapeamento de Níveis Contábeis (configuracao_contabil)
    INSERT INTO public.configuracao_contabil (proprietario_id, tipo_natureza, codigo_nivel_1)
    VALUES
        (p_proprietario_id, 'Ativo', '1'),
        (p_proprietario_id, 'Passivo', '2'),
        (p_proprietario_id, 'Patrimonio Liquido', '3'),
        (p_proprietario_id, 'Receita', '4'),
        (p_proprietario_id, 'Custo', '5'),
        (p_proprietario_id, 'Despesa', '6')
    ON CONFLICT (proprietario_id, tipo_natureza) DO UPDATE SET codigo_nivel_1 = EXCLUDED.codigo_nivel_1;

    -- 4. Mapeamento de Contas a Receber (configuracao_contas_receber)
    IF v_conta_clientes_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES
            (p_proprietario_id, 'a_receber', v_conta_clientes_id),
            (p_proprietario_id, 'parcela', v_conta_clientes_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_caixa_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'recebimento', v_conta_caixa_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_receita_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'recebimento_resultado', v_conta_receita_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_desconto_concedido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'desconto_concedido', v_conta_desconto_concedido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_estorno_desconto_concedido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_receber (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'estorno_desconto_concedido', v_conta_estorno_desconto_concedido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    
    -- 5. Mapeamento de Contas a Pagar (configuracao_contas_pagar)
    IF v_conta_fornecedores_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES
            (p_proprietario_id, 'a_pagar', v_conta_fornecedores_id),
            (p_proprietario_id, 'parcela_pagar', v_conta_fornecedores_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_pagamento_fornecedor_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'pagamento', v_conta_pagamento_fornecedor_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_desconto_obtido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'desconto_obtido', v_conta_desconto_obtido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;
    IF v_conta_estorno_desconto_obtido_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contas_pagar (proprietario_id, tipo_registro, conta_contabil_id)
        VALUES (p_proprietario_id, 'estorno_desconto_obtido', v_conta_estorno_desconto_obtido_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET conta_contabil_id = EXCLUDED.conta_contabil_id;
    END IF;

    -- 6. Mapeamento de Históricos Padrão (configuracao_historico_padrao)
    IF v_historico_capital_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'capital_social', v_historico_capital_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;
    IF v_historico_recebimento_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'recebimento_padrao', v_historico_recebimento_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;
    IF v_historico_pagamento_id IS NOT NULL THEN
        INSERT INTO public.configuracao_historico_padrao (proprietario_id, tipo_registro, historico_id)
        VALUES (p_proprietario_id, 'pagamento_padrao', v_historico_pagamento_id)
        ON CONFLICT (proprietario_id, tipo_registro) DO UPDATE SET historico_id = EXCLUDED.historico_id;
    END IF;

    -- 7. Cria a Conta de Saldo (Caixa)
    IF v_conta_caixa_id IS NOT NULL THEN
        INSERT INTO public.saldo_contas (proprietario_id, nome, saldo_inicial, tipo_saldo, natureza_contabil, conta_contabil_id)
        VALUES (p_proprietario_id, 'Caixa Inicial', 0.00, 'Debito', 'Ativo', v_conta_caixa_id)
        ON CONFLICT (proprietario_id, nome) DO NOTHING;
    END IF;

    -- 8. Mapeamento de Contratos (configuracao_contratos)
    IF v_conta_clientes_id IS NOT NULL AND v_conta_receita_id IS NOT NULL THEN
        INSERT INTO public.configuracao_contratos(proprietario_id, id_conta_clientes_receber, id_conta_receita_contrato)
        VALUES (p_proprietario_id, v_conta_clientes_id, v_conta_receita_id)
        ON CONFLICT (proprietario_id) DO UPDATE 
        SET id_conta_clientes_receber = EXCLUDED.id_conta_clientes_receber,
            id_conta_receita_contrato = EXCLUDED.id_conta_receita_contrato;
    END IF;

    RETURN QUERY SELECT TRUE, 'Configurações padrão mapeadas com sucesso.'::TEXT;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, SQLERRM::text;
END;
$function$