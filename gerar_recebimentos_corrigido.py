#!/usr/bin/env python3
import json

with open('src/dados/admin_recebimentos.json', 'r', encoding='utf-8') as f:
    recebimentos = json.load(f)

sql_lines = []
sql_lines.append("-- SQL para inserir lancamentos de Recebimentos com partida dobrada CORRIGIDA")
sql_lines.append(f"-- Total: {len(recebimentos)} registros × 2 lancamentos\n")

propriet_id = '0561e0b6-6a03-412f-bf42-66a420bd4523'
origem = 'recebimento'
conta_cliente = 'd26585b3-01a6-42e3-99ee-de2347ee4d80'
count = 0

for i, rec in enumerate(recebimentos, 1):
    valor = float(rec['valor_recebido'])
    data = rec['data_recebimento'].split('T')[0] if 'T' in rec['data_recebimento'] else rec['data_recebimento'].split(' ')[0]
    historico = rec.get('historico_id')
    conta_banco = rec.get('id_conta_contabil')
    
    if not conta_banco or conta_banco == 'None':
        continue
    
    historico_val = f"'{historico}'" if historico else 'null'
    
    # Lancamento 1: ENTRADA em Conta Bancaria (banco é devedora, entrada aumenta)
    l1 = f"INSERT INTO lancamentos (id, proprietario_id, data_movimentacao, valor, conta_contabil_id, tipo, historico_id, origem, conciliado, conta_bancaria_id, documento, anexo_id, conta_resultado_id) VALUES (gen_random_uuid(), '{propriet_id}', '{data}', {valor}, '{conta_banco}', 'Entrada', {historico_val}, '{origem}', false, null, null, null, null);"
    sql_lines.append(l1)
    count += 1
    
    # Lancamento 2: ENTRADA em Clientes a Receber (credora, entrada diminui)
    l2 = f"INSERT INTO lancamentos (id, proprietario_id, data_movimentacao, valor, conta_contabil_id, tipo, historico_id, origem, conciliado, conta_bancaria_id, documento, anexo_id, conta_resultado_id) VALUES (gen_random_uuid(), '{propriet_id}', '{data}', {valor}, '{conta_cliente}', 'Entrada', {historico_val}, '{origem}', false, null, null, null, null);"
    sql_lines.append(l2)
    count += 1

with open('recebimentos_lancamentos_corrigido.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))
    f.write(f"\n\n-- Total de lancamentos: {count}\n")

print(f"[OK] SQL gerado: recebimentos_lancamentos_corrigido.sql ({count} INSERTs)")
