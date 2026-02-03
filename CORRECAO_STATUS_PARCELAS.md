# 🔧 Correção: Status de Parcelas

## ❌ Problema Identificado

O sistema estava buscando parcelas com `status = 'Aberta'`, mas no banco de dados as parcelas não pagas têm `status = 'pendente'`.

---

## ✅ Correção Aplicada

### 1. **FormularioAditivo.tsx**
**Linha 67:** Alterado de `'Aberta'` para `'pendente'`

```typescript
// ANTES:
.eq('status', 'Aberta')

// DEPOIS:
.eq('status', 'pendente')
```

### 2. **Script SQL (20260203_001_aditivos_contratuais.sql)**
**Linhas 198, 250, 281:** Alterado todas as ocorrências

```sql
-- ANTES:
AND status = 'Aberta';

-- DEPOIS:
AND status = 'pendente';
```

### 3. **Documentação atualizada**
README.md atualizado para refletir que o sistema busca parcelas **pendentes** (não pagas).

---

## 🎯 Status das Parcelas no Sistema

Conforme `scriptTabelas.md` linha 275:

| Status | Descrição |
|--------|-----------|
| `'pendente'` | Parcela NÃO paga (disponível para aditivo) |
| `'pago'` | Parcela já paga (NÃO pode ser alterada) |
| `'cancelado'` | Parcela cancelada (NÃO pode ser alterada) |

---

## ✅ Como Testar Agora

1. **Recarregue a página** (o frontend já está corrigido)
2. Na tabela de contratos, clique no botão 📝 no contrato **ATIVO**
3. O sistema agora vai encontrar as parcelas pendentes!
4. **Se já rodou o script SQL no Supabase:**
   - Execute novamente o script corrigido
   - Ou rode apenas este comando:

```sql
-- Fix rápido: atualizar apenas a function
DROP FUNCTION IF EXISTS criar_aditivo_contratual;
-- Depois rode novamente o script completo
```

---

## 📊 Exemplo com o Contrato de Teste

**Contrato:** PAULO CESAR PINA DA ROCHA LIMA
- Valor Total: R$ 2.990,00
- Progresso: 1/13 (1 paga, **12 pendentes**)
- Status: Ativo ✅

**Agora o sistema vai:**
- Buscar as **12 parcelas pendentes**
- Permitir criar aditivo
- Mostrar preview do recálculo

---

**Data da Correção:** 03/02/2026  
**Arquivos Corrigidos:** 3  
**Status:** ✅ RESOLVIDO
