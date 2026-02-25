import json
import uuid
from datetime import datetime

proprietario_id = '0561e0b6-6a03-412f-bf42-66a420bd4523'

# Contas a usar:
# Passivo: 2.1.03.0007 (Conta a Pagar)
# Despesa: 5.1.03.0005 (Certificadora), 5.1.03.0003 (Material), 5.1.03.0004 (Sistema), 
#          5.1.03.0001 (Combustível), 5.1.03.0002 (Educação/Treinamento)
# Pró-Labore: 5.2.01.0001 (se existir) ou similar

contas_pagar_data = [
    {"fornecedor": "CERTIFICADORA", "valor": 90, "data": "2026-02-13", "conta_resultado": "5ed545cd-b958-44f2-8ddb-07bf177bc4ff", "descricao": "CERTIFICADO DIGITAL A1 CNPJ", "status": "pago"},
    {"fornecedor": "MATERIAL DE ESCRITORIO", "valor": 150, "data": "2026-02-14", "conta_resultado": "e585c4be-58b0-402a-92f9-d8dc1733d547", "descricao": "MATERIAL DE ESCRITORIO", "status": "pendente"},
    {"fornecedor": "SISTEMA GDOOR", "valor": 13320, "data": "2026-02-16", "conta_resultado": "a887c021-c42c-4aa8-9cba-73a8ee10506c", "descricao": "SISTEMA GDOOR", "status": "pendente"},
    {"fornecedor": "CRC-PA", "valor": 2565.57, "data": "2026-02-23", "conta_resultado": "f2db1404-8fb6-476f-84a0-4b4abc4736ae", "descricao": "CRC-PA", "status": "pendente"},
    {"fornecedor": "Unama - João Tavares (MBA em Gestão Tributária)", "valor": 1820.4, "data": "2026-02-07", "conta_resultado": "2d6af2a2-8ec8-4bb5-9d9a-560985731d96", "descricao": "Unama - João Tavares (MBA em Gestão Tributária)", "status": "pendente"},
    {"fornecedor": "Unama - João Tavares (Engenharia de Software)", "valor": 1553.28, "data": "2026-02-07", "conta_resultado": "2d6af2a2-8ec8-4bb5-9d9a-560985731d96", "descricao": "Unama - João Tavares (Engenharia de Software)", "status": "pendente"},
    {"fornecedor": "COMBUSTIVEL", "valor": 8400, "data": "2026-02-24", "conta_resultado": "2f85ad3e-0ac9-4627-9666-65f3f9e67b39", "descricao": "COMBUSTIVEL", "status": "pendente"},
    {"fornecedor": "Tatiana Tavares", "valor": 36000, "data": "2026-01-07", "conta_resultado": "36fe8369-b233-4b8b-b925-88b4c7c14dae", "descricao": "Pró Labore", "status": "pendente"},
    {"fornecedor": "André Tavares", "valor": 24000, "data": "2026-01-07", "conta_resultado": "36fe8369-b233-4b8b-b925-88b4c7c14dae", "descricao": "Pró Labore", "status": "pendente"},
    {"fornecedor": "Marilene Tavares", "valor": 20400, "data": "2026-01-07", "conta_resultado": "36fe8369-b233-4b8b-b925-88b4c7c14dae", "descricao": "Pró Labore", "status": "pendente"},
    {"fornecedor": "IPTU VILA", "valor": 1165.5, "data": "2026-02-06", "conta_resultado": "e585c4be-58b0-402a-92f9-d8dc1733d547", "descricao": "IPTU VILA", "status": "pendente"},
    {"fornecedor": "Unama-Facul-Tatiana", "valor": 2387.76, "data": "2026-02-09", "conta_resultado": "2d6af2a2-8ec8-4bb5-9d9a-560985731d96", "descricao": "Faculdade Tatiana", "status": "pendente"},
    {"fornecedor": "Gildson Gregório", "valor": 20400, "data": "2026-01-07", "conta_resultado": "36fe8369-b233-4b8b-b925-88b4c7c14dae", "descricao": "Pró Labore", "status": "pendente"},
    {"fornecedor": "João Tavares", "valor": 96000, "data": "2026-01-07", "conta_resultado": "36fe8369-b233-4b8b-b925-88b4c7c14dae", "descricao": "Pró Labore", "status": "pendente"},
]

print("-- Lançamentos de Contas a Pagar com partida dobrada correta")
print("-- CP (credora): Saída=+saldo")
print("-- Despesa (devedora): Entrada=+saldo")
print()

for i, cp in enumerate(contas_pagar_data, 1):
    id_cp = str(uuid.uuid4())
    id_despesa = str(uuid.uuid4())
    
    # Determinar a conta de despesa baseado na descrição
    if "CERTIFICADORA" in cp['fornecedor'] or "CERTIFICADO" in cp['descricao']:
        conta_despesa = "5.1.03.0005"  # Certificadora Digital
    elif "MATERIAL" in cp['fornecedor'] or "MATERIAL" in cp['descricao']:
        conta_despesa = "5.1.03.0003"  # Material
    elif "SISTEMA" in cp['fornecedor']:
        conta_despesa = "5.1.03.0004"  # Sistema
    elif "COMBUSTIVEL" in cp['fornecedor']:
        conta_despesa = "5.1.03.0001"  # Combustível
    elif "Pró Labore" in cp['descricao']:
        conta_despesa = "5.2.01.0001"  # Pró-Labore (ajuste se necessário)
    elif "IPTU" in cp['fornecedor']:
        conta_despesa = "5.1.03.0003"  # Ou outra conta apropriada
    elif "Unama" in cp['fornecedor'] or "Faculdade" in cp['descricao']:
        conta_despesa = "5.1.03.0002"  # Educação/Treinamento
    elif "CRC" in cp['fornecedor']:
        conta_despesa = "5.1.03.0002"  # Educação/Profissional
    else:
        conta_despesa = "5.1.03.0001"  # Default
    
    tipo_pagamento = "PAG" if cp['status'] == "pago" else "CP"
    
    print(f"-- {i}. {cp['fornecedor']} - R$ {cp['valor']}")
    print(f"INSERT INTO lancamentos (id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado)")
    print(f"VALUES ('{id_cp}', '{proprietario_id}', (SELECT id FROM plano_contas WHERE \"Conta\" = '2.1.03.0007' AND proprietario_id = '{proprietario_id}'), '{cp['data']}', 'Saida', {cp['valor']}, '{cp['descricao']}', 'contas_pagar_manual', 'CP-{i:03d}', false);")
    print(f"INSERT INTO lancamentos (id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado)")
    print(f"VALUES ('{id_despesa}', '{proprietario_id}', (SELECT id FROM plano_contas WHERE \"Conta\" = '{conta_despesa}' AND proprietario_id = '{proprietario_id}'), '{cp['data']}', 'Entrada', {cp['valor']}, '{cp['descricao']}', 'contas_pagar_manual', 'CP-{i:03d}', false);")
    print()
