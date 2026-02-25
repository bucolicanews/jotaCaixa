# 📋 Guia de Restauração de Lançamentos Contábeis

## Status Atual

✅ **FASE 1**: Coluna `saldo_tipo` adicionada ao `plano_contas` (2.228 contas)
✅ **FASE 2.1**: 52 lançamentos de Contas a Receber (CR) inseridos
⏳ **FASE 2.2**: Pronto para restaurar Recebimentos, CP e Pagamentos

---

## Arquivo SQL Gerado

**Localização:** `restore_lancamentos.sql`  
**Tamanho:** 266 linhas  
**Lançamentos a inserir:** 104 registros

### Breakdown:
- **22 Recebimentos** → 44 lançamentos (2 cada: Entrada em Banco + Saída em Cliente a Receber)
- **16 Contas a Pagar** → 32 lançamentos (2 cada: Entrada em Despesa + Saída em Passivo)
- **26 Pagamentos** → 52 lançamentos (2 cada: Saída em Banco + Entrada em Passivo)
- **Total:** 128 lançamentos em partida dobrada correta

---

## Como Executar

### Opção 1: Supabase Console (Recomendado)

1. Acesse: https://app.supabase.com/project/jqoirlswewggyppgvgnv/sql/new
2. Abra o arquivo `restore_lancamentos.sql`
3. Copie o conteúdo inteiro
4. Cole no Supabase SQL Editor
5. Clique em "Run" (Ctrl + Enter)
6. ✅ Pronto!

### Opção 2: Programaticamente (Node.js)

```bash
node execute_restore_lancamentos.js
```

---

## Validação Pós-Execução

### 1. Verificar contagem de lançamentos

```sql
SELECT COUNT(*) as total_lancamentos FROM lancamentos;
```

**Esperado:** 104 + 52 (CRs anteriores) = 156 lançamentos

### 2. Verificar balanço patrimonial

```sql
SELECT 
  SUM(CASE WHEN "Conta" LIKE '1%' THEN saldo ELSE -saldo END) as ativo,
  SUM(CASE WHEN "Conta" LIKE '2%' OR "Conta" LIKE '3%' THEN saldo ELSE -saldo END) as passivo_pl,
  (SUM(CASE WHEN "Conta" LIKE '1%' THEN saldo ELSE -saldo END) - 
   SUM(CASE WHEN "Conta" LIKE '2%' OR "Conta" LIKE '3%' THEN saldo ELSE -saldo END)) as diferenca
FROM plano_contas pc
LEFT JOIN saldo_contas sc ON pc.id = sc.conta_contabil_id;
```

**Esperado:** Diferença = 0 (Ativo = Passivo + PL)

### 3. Verificar contas críticas

```sql
-- Clientes a Receber
SELECT 'Clientes a Receber' as conta, COUNT(*) FROM lancamentos 
WHERE conta_contabil_id = 'd26585b3-a890-4a2e-8f5c-e8c5d9b4f2e1';

-- Receita
SELECT 'Receita' as conta, COUNT(*) FROM lancamentos 
WHERE conta_contabil_id = '41299678-97c5-43a0-975a-ea7827215453';

-- Pró-Labore a Pagar
SELECT 'Pró-Labore' as conta, COUNT(*) FROM lancamentos 
WHERE conta_contabil_id = 'adaf2744-67f7-401b-98ce-28fc4a6638c9';
```

---

## Mapeamento de Contas

| Conta | UUID | Tipo | Lançamentos |
|-------|------|------|-------------|
| Caixa Matriz (1.1.01.0001) | `4d407769-10f5-4c5a-8d50-9c6d3dfb4903` | Banco | Recebimentos |
| PagBank (1.1.01.0005) | `14ff496e-7640-4f56-a2a8-f0b048244026` | Banco | Recebimentos |
| Clientes Contratos (1.1.02.0002) | `d26585b3-a890-4a2e-8f5c-e8c5d9b4f2e1` | Ativo | CR |
| Receita (4.1.01...) | `41299678-97c5-43a0-975a-ea7827215453` | Receita | CR, Recebimentos |
| Pró-Labore a Pagar (2.1.02...) | `adaf2744-67f7-401b-98ce-28fc4a6638c9` | Passivo | CP, Pagamentos |

---

## Regras de Partida Dobrada Aplicadas

### Recebimento (CR → Banco)
```
+ Entrada em Banco (conta_contabil_id = 14ff496e...)
- Saída em Clientes a Receber (conta_contabil_id = d26585b3...)
```

### Conta a Pagar (Fornecedor → Passivo)
```
+ Entrada em Despesa (conta_contabil_id = id_conta_resultado)
- Saída em Passivo (conta_contabil_id = id_conta_patrimonial)
```

### Pagamento (Banco → Passivo)
```
- Saída em Banco (conta_contabil_id = 007cefd6...)
+ Entrada em Passivo (conta_contabil_id = id_conta_patrimonial)
```

---

## Próximos Passos (FASE 3-5)

- [ ] Criar página `/contabilidade/diagnostico-balanco` para validar integridade
- [ ] Atualizar hook `use-balanco-patrimonial.ts` para usar coluna `saldo_tipo`
- [ ] Validar equação: Ativo = Passivo + PL + Resultado
- [ ] Testes de balanceamento

---

## Problemas Conhecidos

❌ Se ocorrer erro de FK:
- Verificar se todas as contas existem em `plano_contas`
- Consultar: `SELECT id FROM plano_contas WHERE id IN ('uuid1', 'uuid2', ...)`

❌ Se o balanço não equilibrar:
- Verificar se `saldo_tipo` está populado corretamente
- Executar: `SELECT COUNT(*) FROM plano_contas WHERE saldo_tipo IS NULL`

---

## Contatos

**Data de Execução:** 2026-02-25  
**Gerado por:** Sistema de Restauração Contábil  
**Admin ID:** 0561e0b6-6a03-412f-bf42-66a420bd4523
