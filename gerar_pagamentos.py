#!/usr/bin/env python3
import json

with open('src/dados/admin_pagamentos.json', 'r', encoding='utf-8') as f:
    pagamentos = json.load(f)

sql_lines = []
sql_lines.append("-- SQL para inserir lancamentos de Pagamentos com partida dobrada")
sql_lines.append(f"-- Total: {len(pagamentos)} registros × 2 lancamentos = {len(pagamentos) * 2} INSERTs\n")

propriet_id = '0561e0b6-6a03-412f-bf42-66a420bd4523'
origem = 'pagamento'
count = 0

for i, pag in enumerate(pagamentos, 1):
    valor = float(pag['valor_pago'])
    data = pag['data_pagamento'].split('T')[0] if 'T' in pag['data_pagamento'] else pag['data_pagamento'].split(' ')[0]
    historico = pag.get('historico_id')
    conta_resultado = pag.get('id_conta_resultado')
    conta_banco = pag.get('id_conta_contabil')
    
    # Pular registros sem contas válidas
    if not conta_banco or conta_banco == 'None':
        continue
    
    historico_val = f"'{historico}'" if historico else 'null'
    
    # Lançamento 1: Saída em Conta de Resultado (Despesa)
    if conta_resultado and conta_resultado != 'None':
        l1 = f"INSERT INTO lancamentos (id, proprietario_id, data_movimentacao, valor, conta_contabil_id, tipo, historico_id, origem, conciliado, conta_bancaria_id, documento, anexo_id, conta_resultado_id) VALUES (gen_random_uuid(), '{propriet_id}', '{data}', {valor}, '{conta_resultado}', 'Saida', {historico_val}, '{origem}', false, null, null, null, null);"
        sql_lines.append(l1)
        count += 1
    
    # Lançamento 2: Entrada em Conta Bancária
    l2 = f"INSERT INTO lancamentos (id, proprietario_id, data_movimentacao, valor, conta_contabil_id, tipo, historico_id, origem, conciliado, conta_bancaria_id, documento, anexo_id, conta_resultado_id) VALUES (gen_random_uuid(), '{propriet_id}', '{data}', {valor}, '{conta_banco}', 'Entrada', {historico_val}, '{origem}', false, null, null, null, null);"
    sql_lines.append(l2)
    count += 1

with open('pagamentos_lancamentos.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))
    f.write(f"\n\n-- Total de lancamentos: {count}\n")
    f.write(f"-- Saldo total esperado: 0.00 (partida dobrada)\n")

print(f"[OK] SQL gerado: pagamentos_lancamentos.sql ({count} INSERTs)")
