import json
from datetime import datetime, timedelta
import uuid

proprietario_id = '0561e0b6-6a03-412f-bf42-66a420bd4523'

# Contas necessárias
contas = {
    'banco_pag': '1.1.01.0005',  # PagBank
    'clientes_receber': '1.1.02.0002',  # Clientes a Receber
    'despesa': '6.1.03',  # Despesa genérica
    'conta_pagar': '2.1.03.0007'  # Conta a Pagar
}

# Dados de recebimentos
recebimentos = [
    {'data': '2025-01-15', 'valor': 5000.00, 'cliente': 'Cliente A', 'descricao': 'Recebimento Consultoria'},
    {'data': '2025-01-20', 'valor': 3000.00, 'cliente': 'Cliente B', 'descricao': 'Recebimento Projeto'},
    {'data': '2025-02-10', 'valor': 8000.00, 'cliente': 'Cliente C', 'descricao': 'Recebimento Contrato'},
    {'data': '2025-02-15', 'valor': 4500.00, 'cliente': 'Cliente D', 'descricao': 'Recebimento Serviços'},
    {'data': '2025-02-20', 'valor': 6000.00, 'cliente': 'Cliente E', 'descricao': 'Recebimento Consultoria'},
]

# Dados de pagamentos
pagamentos = [
    {'data': '2025-01-10', 'valor': 2000.00, 'fornecedor': 'Combustível', 'conta': '6.1.03.0001'},
    {'data': '2025-01-15', 'valor': 1500.00, 'fornecedor': 'Educação', 'conta': '6.1.03.0002'},
    {'data': '2025-01-20', 'valor': 800.00, 'fornecedor': 'Material', 'conta': '6.1.03.0003'},
    {'data': '2025-02-05', 'valor': 3000.00, 'fornecedor': 'Sistema', 'conta': '6.1.03.0004'},
    {'data': '2025-02-10', 'valor': 1200.00, 'fornecedor': 'Combustível', 'conta': '6.1.03.0001'},
    {'data': '2025-02-15', 'valor': 900.00, 'fornecedor': 'Educação', 'conta': '6.1.03.0002'},
]

# Dados de contas a pagar
contas_pagar = [
    {'data': '2025-01-05', 'valor': 1500.00, 'fornecedor': 'Combustível CP', 'conta': '6.1.03.0001'},
    {'data': '2025-01-10', 'valor': 2000.00, 'fornecedor': 'Sistema CP', 'conta': '6.1.03.0004'},
    {'data': '2025-02-01', 'valor': 3500.00, 'fornecedor': 'Certificadora CP', 'conta': '6.1.03.0005'},
]

print("-- RECEBIMENTOS (Entrada em Banco + Saída em Clientes)")
print("-- Partida Dobrada Correta: Banco (devedora) = +entrada, Clientes (devedora) = -saída")
for i, rec in enumerate(recebimentos, 1):
    id_banco = str(uuid.uuid4())
    id_clientes = str(uuid.uuid4())
    
    print(f"\n-- Recebimento {i}: {rec['descricao']}")
    print(f"INSERT INTO lancamentos (id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado)")
    print(f"VALUES ('{id_banco}', '{proprietario_id}', (SELECT id FROM plano_contas WHERE \"Conta\" = '{contas['banco_pag']}' AND proprietario_id = '{proprietario_id}'), '{rec['data']}', 'Entrada', {rec['valor']}, '{rec['descricao']} - {rec['cliente']}', 'recebimento_manual', 'REC-{i:03d}', false);")
    print(f"INSERT INTO lancamentos (id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado)")
    print(f"VALUES ('{id_clientes}', '{proprietario_id}', (SELECT id FROM plano_contas WHERE \"Conta\" = '{contas['clientes_receber']}' AND proprietario_id = '{proprietario_id}'), '{rec['data']}', 'Saida', {rec['valor']}, '{rec['descricao']} - {rec['cliente']}', 'recebimento_manual', 'REC-{i:03d}', false);")

print("\n\n-- PAGAMENTOS (Saída em Despesa + Saída em Banco)")
print("-- Partida Dobrada Correta: Despesa (credora) = -saída (+saldo), Banco (devedora) = -saída (-saldo)")
for i, pag in enumerate(pagamentos, 1):
    id_despesa = str(uuid.uuid4())
    id_banco = str(uuid.uuid4())
    
    print(f"\n-- Pagamento {i}: {pag['fornecedor']}")
    print(f"INSERT INTO lancamentos (id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado)")
    print(f"VALUES ('{id_despesa}', '{proprietario_id}', (SELECT id FROM plano_contas WHERE \"Conta\" = '{pag['conta']}' AND proprietario_id = '{proprietario_id}'), '{pag['data']}', 'Saida', {pag['valor']}, '{pag['fornecedor']}', 'pagamento_manual', 'PAG-{i:03d}', false);")
    print(f"INSERT INTO lancamentos (id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado)")
    print(f"VALUES ('{id_banco}', '{proprietario_id}', (SELECT id FROM plano_contas WHERE \"Conta\" = '{contas['banco_pag']}' AND proprietario_id = '{proprietario_id}'), '{pag['data']}', 'Saida', {pag['valor']}, '{pag['fornecedor']}', 'pagamento_manual', 'PAG-{i:03d}', false);")

print("\n\n-- CONTAS A PAGAR (Saída em CP + Entrada em Despesa)")
print("-- Partida Dobrada Correta: CP (credora) = -saída (+saldo), Despesa (credora) = +entrada (-saldo)")
for i, cp in enumerate(contas_pagar, 1):
    id_conta_pagar = str(uuid.uuid4())
    id_despesa = str(uuid.uuid4())
    
    print(f"\n-- Conta a Pagar {i}: {cp['fornecedor']}")
    print(f"INSERT INTO lancamentos (id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado)")
    print(f"VALUES ('{id_conta_pagar}', '{proprietario_id}', (SELECT id FROM plano_contas WHERE \"Conta\" = '{contas['conta_pagar']}' AND proprietario_id = '{proprietario_id}'), '{cp['data']}', 'Saida', {cp['valor']}, '{cp['fornecedor']}', 'contas_pagar_manual', 'CP-{i:03d}', false);")
    print(f"INSERT INTO lancamentos (id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado)")
    print(f"VALUES ('{id_despesa}', '{proprietario_id}', (SELECT id FROM plano_contas WHERE \"Conta\" = '{cp['conta']}' AND proprietario_id = '{proprietario_id}'), '{cp['data']}', 'Entrada', {cp['valor']}, '{cp['fornecedor']}', 'contas_pagar_manual', 'CP-{i:03d}', false);")
