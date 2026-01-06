# Documentação: Correção de RLS e Constraint na Tabela de Conciliação

## 1. Resumo do Problema

Dois erros críticos foram identificados na tabela `protocolo_conciliacao` no Supabase:

### 1.1 Erro de RLS (Row Level Security)
**Mensagem de Erro:**
```
row level security policy 'Enable read for users based on user_id' of relation 'protocolo_conciliacao' does not exist
```

**Contexto:** 
A aplicação tentava executar operações na tabela `protocolo_conciliacao`, mas o Supabase não conseguia encontrar a política de segurança esperada (`Enable read for users based on user_id`). Isso impedia qualquer acesso aos dados da tabela, resultando em falhas de leitura e escrita.

### 1.2 Erro de Constraint de Chave Única
**Mensagem de Erro:**
```
duplicate key value violates unique constraint
```

**Contexto:**
Ao tentar inserir registros na tabela, a aplicação encontrava conflitos de chave única. Isso ocorria porque não havia uma constraint apropriada definida na tabela para garantir unicidade corretamente ou a constraint estava mal configurada.

---

## 2. Causas Raiz

### 2.1 Por que o RLS Estava Bloqueando Acesso?

1. **Política Faltante ou Corrompida**
   - A tabela `protocolo_conciliacao` estava com RLS habilitado (`rls_enabled = true`)
   - Mas as políticas de segurança esperadas não existiam ou foram removidas
   - Quando RLS está habilitado sem políticas definidas, o acesso é negado por padrão

2. **Mismatch de Nomes de Políticas**
   - A aplicação tentava usar uma política chamada `Enable read for users based on user_id`
   - Essa política não existia na tabela
   - Sem a política, nenhuma operação conseguia passar pela verificação de segurança

### 2.2 Por que o Erro de Chave Duplicada Ocorria?

1. **Falta de Constraint Apropriado**
   - A tabela não tinha um constraint de chave única bem definido
   - Múltiplos registros com os mesmos valores podiam existir simultaneamente
   - Quando a aplicação tentava garantir unicidade, conflitos eram encontrados

2. **Dados Inconsistentes**
   - Dados legados ou mal estruturados podiam conter duplicatas
   - Sem um constraint para prevenir isso, a tabela permitia estados inválidos

---

## 3. Visão Geral da Solução

A migração implementa uma solução em duas etapas:

### 3.1 Etapa 1: Reparar Políticas de RLS
- **Remove** a política corrompida que estava causando erro
- **Cria** política `SELECT` que permite leitura baseada em `user_id`
- **Cria** política `INSERT` que permite inserção de dados do usuário autenticado
- **Cria** política `UPDATE` que permite atualização de registros próprios
- **Cria** política `DELETE` que permite deleção de registros próprios

### 3.2 Etapa 2: Implementar Constraint de Unicidade
- **Remove** registros duplicados (se houver)
- **Cria** um constraint `UNIQUE` nas colunas apropriadas para prevenir duplicatas futuras
- **Define** comportamento para conflitos (ex: tratamento de erros apropriado)

---

## 4. Detalhes da Migração

### 4.1 Reparação de RLS

#### Remover a Política Problemática
```sql
DROP POLICY IF EXISTS "Enable read for users based on user_id" 
ON protocolo_conciliacao;
```
**Propósito:** Remove a política corrompida que estava causando o erro `does not exist`.

#### Criar Política SELECT (Leitura)
```sql
CREATE POLICY "Enable read for users based on user_id"
ON protocolo_conciliacao
FOR SELECT
USING (auth.uid() = user_id);
```
**O que faz:**
- Usuários autenticados podem ler apenas seus próprios registros
- A coluna `user_id` deve conter o UID do usuário autenticado
- Qualquer outra tentativa de leitura é bloqueada pelo RLS

#### Criar Política INSERT (Inserção)
```sql
CREATE POLICY "Enable insert for authenticated users"
ON protocolo_conciliacao
FOR INSERT
WITH CHECK (auth.uid() = user_id);
```
**O que faz:**
- Apenas usuários autenticados podem inserir registros
- O `user_id` do registro deve corresponder ao UID do usuário que está inserindo
- Impede que um usuário insira dados em nome de outro

#### Criar Política UPDATE (Atualização)
```sql
CREATE POLICY "Enable update for users based on user_id"
ON protocolo_conciliacao
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```
**O que faz:**
- Usuários podem atualizar apenas seus próprios registros
- Tanto a verificação inicial quanto a verificação final devem passar

#### Criar Política DELETE (Deleção)
```sql
CREATE POLICY "Enable delete for users based on user_id"
ON protocolo_conciliacao
FOR DELETE
USING (auth.uid() = user_id);
```
**O que faz:**
- Usuários podem deletar apenas seus próprios registros

### 4.2 Constraint de Unicidade

#### Limpar Duplicatas (Se Necessário)
```sql
DELETE FROM protocolo_conciliacao
WHERE id NOT IN (
    SELECT MIN(id)
    FROM protocolo_conciliacao
    GROUP BY user_id, protocolo_id, data_conciliacao
);
```
**O que faz:**
- Identifica registros duplicados baseado em (`user_id`, `protocolo_id`, `data_conciliacao`)
- Mantém apenas o registro mais antigo (menor ID)
- Remove os duplicados

#### Criar Constraint de Chave Única
```sql
ALTER TABLE protocolo_conciliacao
ADD CONSTRAINT protocolo_conciliacao_user_protocolo_data_key 
UNIQUE (user_id, protocolo_id, data_conciliacao);
```
**O que faz:**
- Garante que não existam dois registros com a mesma combinação de:
  - `user_id` (usuário)
  - `protocolo_id` (protocolo referenciado)
  - `data_conciliacao` (data da conciliação)
- Mantém a integridade dos dados daqui em diante

---

## 5. Como Aplicar a Migração no Supabase

### 5.1 Acessar o Supabase
1. Entre em [supabase.com](https://supabase.com)
2. Acesse seu projeto
3. Navegue até **SQL Editor**

### 5.2 Executar a Migração
1. **Crie uma nova query** clicando em "New Query"
2. **Copie e cole** todo o código SQL abaixo:

```sql
-- ============================================================================
-- MIGRATION: Fix RLS and Unique Constraint on protocolo_conciliacao
-- ============================================================================

-- Step 1: Remove the broken policy
DROP POLICY IF EXISTS "Enable read for users based on user_id" 
ON protocolo_conciliacao;

-- Step 2: Create proper RLS policies
CREATE POLICY "Enable read for users based on user_id"
ON protocolo_conciliacao
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Enable insert for authenticated users"
ON protocolo_conciliacao
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update for users based on user_id"
ON protocolo_conciliacao
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable delete for users based on user_id"
ON protocolo_conciliacao
FOR DELETE
USING (auth.uid() = user_id);

-- Step 3: Clean up duplicates (if any exist)
DELETE FROM protocolo_conciliacao
WHERE id NOT IN (
    SELECT MIN(id)
    FROM protocolo_conciliacao
    GROUP BY user_id, protocolo_id, data_conciliacao
);

-- Step 4: Create unique constraint
ALTER TABLE protocolo_conciliacao
ADD CONSTRAINT protocolo_conciliacao_user_protocolo_data_key 
UNIQUE (user_id, protocolo_id, data_conciliacao);
```

3. **Clique em "Run"** para executar a migração
4. **Verifique o resultado** - deve aparecer "Query successful" sem erros

### 5.3 Confirmar a Aplicação

Após executar a migração, verifique as políticas:

```sql
SELECT * FROM pg_policies 
WHERE tablename = 'protocolo_conciliacao';
```

Verifique os constraints:

```sql
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'protocolo_conciliacao';
```

---

## 6. Testes de Verificação

### 6.1 Teste de RLS - Leitura (SELECT)

**1. Simular usuário A lendo seus dados:**
```sql
-- Execute como usuário A (substitua UUID real)
SELECT * FROM protocolo_conciliacao 
WHERE user_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
```
**Esperado:** Retorna registros pertencentes ao usuário A

**2. Simular usuário A tentando ler dados de usuário B:**
```sql
-- Execute como usuário A
SELECT * FROM protocolo_conciliacao 
WHERE user_id = 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy';
```
**Esperado:** Retorna vazio (sem erro, apenas sem dados)

### 6.2 Teste de RLS - Inserção (INSERT)

**1. Inserir registro próprio:**
```sql
INSERT INTO protocolo_conciliacao (user_id, protocolo_id, data_conciliacao, status)
VALUES ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 1, NOW(), 'pendente');
```
**Esperado:** Sucesso - registro é inserido

**2. Inserir registro de outro usuário (deve falhar):**
```sql
INSERT INTO protocolo_conciliacao (user_id, protocolo_id, data_conciliacao, status)
VALUES ('yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy', 1, NOW(), 'pendente');
```
**Esperado:** Erro ou sem resultado (RLS bloqueia)

### 6.3 Teste de Constraint de Unicidade

**1. Inserir dois registros iguais:**
```sql
-- Primeiro insert (sucesso esperado)
INSERT INTO protocolo_conciliacao (user_id, protocolo_id, data_conciliacao, status)
VALUES ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 1, '2024-01-01', 'pendente');

-- Segundo insert (falha esperada)
INSERT INTO protocolo_conciliacao (user_id, protocolo_id, data_conciliacao, status)
VALUES ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 1, '2024-01-01', 'pendente');
```
**Esperado:** 
- Primeiro: `INSERT 0 1` (sucesso)
- Segundo: Erro `duplicate key value violates unique constraint`

### 6.4 Teste de Integridade Completa

```sql
-- Verificar RLS está ativo
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'protocolo_conciliacao';

-- Verificar políticas existem
SELECT policyname, qual, with_check, using
FROM pg_policies
WHERE tablename = 'protocolo_conciliacao'
ORDER BY policyname;

-- Verificar constraint de unicidade
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'protocolo_conciliacao'
AND constraint_type = 'UNIQUE';
```

---

## 7. Implicações de Segurança

### 7.1 Por que essas políticas são seguras?

#### 1. **Isolamento de Dados por Usuário (Confidencialidade)**
- Cada usuário vê apenas seus próprios registros
- A condição `auth.uid() = user_id` garante que a segurança é baseada na identidade do usuário autenticado
- Impossível acessar dados de outros usuários através de queries diretas

#### 2. **Prevenção de Elevação de Privilégio**
- Usuários não podem inserir dados em nome de outro usuário
- A política `INSERT` valida que `user_id` corresponde ao usuário autenticado
- Impossível contornar através da aplicação ou de queries manuais

#### 3. **Integridade Referencial**
- O constraint de unicidade previne duplicatas
- Garante consistência nos dados de conciliação
- Evita estado inconsistente onde registros duplicados poderiam causar confusão

#### 4. **Auditoria e Rastreabilidade**
- Como cada registro está ligado a um `user_id`, é possível rastrear quem criou/modificou cada registro
- As políticas garantem que nenhuma ação pode ser disfarçada como de outro usuário

### 7.2 Cenários Protegidos

| Cenário | Proteção |
|---------|----------|
| Usuário A tenta ler dados de Usuário B | ❌ Bloqueado pelo RLS SELECT policy |
| Usuário A tenta inserir dados como Usuário B | ❌ Bloqueado pelo RLS INSERT policy |
| Usuário A tenta atualizar registro de Usuário B | ❌ Bloqueado pelo RLS UPDATE policy |
| Usuário A tenta deletar registro de Usuário B | ❌ Bloqueado pelo RLS DELETE policy |
| Aplicação tenta inserir duplicata | ❌ Bloqueado pelo UNIQUE constraint |
| Admin insere dados diretamente sem `user_id` válido | ❌ Bloqueado pelo RLS INSERT policy |

### 7.3 Boas Práticas Implementadas

✅ **Princípio do Menor Privilégio:** Cada operação é restrita ao mínimo necessário  
✅ **Verificação em Múltiplas Camadas:** RLS no banco + constraint de integridade  
✅ **Autenticação Integrada:** Usa `auth.uid()` nativo do Supabase  
✅ **Imutabilidade de Identidade:** `user_id` não pode ser alterado após inserção  
✅ **Prevenção de SQL Injection:** Todas as condições usam colunas reais, não valores diretos  

---

## 8. Troubleshooting

### Problema: "relation 'protocolo_conciliacao' does not exist"
**Solução:** Verifique se a tabela existe no banco de dados usando:
```sql
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'protocolo_conciliacao'
);
```

### Problema: "permission denied for schema public"
**Solução:** Verifique se seu usuário tem permissão. Entre como usuário admin (padrão no Supabase quando via dashboard).

### Problema: "duplicate key value violates unique constraint" após aplicar migração
**Solução:** Dados antigos contêm duplicatas. Execute o passo 3 manualmente:
```sql
DELETE FROM protocolo_conciliacao
WHERE id NOT IN (
    SELECT MIN(id)
    FROM protocolo_conciliacao
    GROUP BY user_id, protocolo_id, data_conciliacao
);
```

### Problema: RLS policy still showing as not existing
**Solução:** Verifique se RLS está habilitado:
```sql
ALTER TABLE protocolo_conciliacao ENABLE ROW LEVEL SECURITY;
```

---

## 9. Próximos Passos Recomendados

1. **Aplicar a migração** em desenvolvimento e testar
2. **Executar os testes de verificação** para confirmar funcionamento
3. **Documentar no código da aplicação** que RLS está ativo
4. **Implementar tratamento de erros** na aplicação para:
   - Erro de `duplicate key` → usuário já tem registro de conciliação nessa data
   - Erro de RLS → usuário não autenticado ou sessão expirada
5. **Monitorar logs** do Supabase para possíveis violações de segurança
6. **Revisar regularmente** políticas de RLS conforme novos requisitos surgem

---

## 10. Referências

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Policies](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Supabase Auth Functions](https://supabase.com/docs/guides/auth/row-level-security#how-it-works)

---

**Documento criado em:** 2026-01-06  
**Versão:** 1.0  
**Status:** Pronto para aplicação em produção
