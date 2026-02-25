const cr = require('./src/dados/admin_contas_receber.json');
const rec = require('./src/dados/admin_recebimentos.json');
const { v4: uuidv4 } = require('uuid');

const PROPRIETARIO_ID = '0561e0b6-6a03-412f-bf42-66a420bd4523';
const ORIGEM_CR = 'lancamento_cr';
const ORIGEM_REC = 'recebimento_manual';
const TIPO_ENTRADA = 'entrada';
const TIPO_SAIDA = 'saida';

// SQL INSERT for CRs - 26 CRs x 2 lançamentos = 52 entries
const crInserts = [];
let crCount = 0;

cr.forEach(conta => {
  if (!conta.id_conta_patrimonial && !conta.id_conta_resultado) return;
  
  crCount++;
  const data_ref = conta.data_emissao;
  
  // Lançamento 1: ENTRADA na conta patrimonial
  if (conta.id_conta_patrimonial) {
    crInserts.push({
      id: uuidv4(),
      proprietario_id: PROPRIETARIO_ID,
      tipo: TIPO_ENTRADA,
      descricao: `CR: ${conta.descricao}`,
      valor: parseFloat(conta.valor_total),
      data_lancamento: data_ref,
      id_conta_contabil: conta.id_conta_patrimonial,
      origem: ORIGEM_CR,
      referencia_id: conta.id,
      created_at: new Date().toISOString()
    });
  }
  
  // Lançamento 2: SAIDA na conta resultado (receita)
  if (conta.id_conta_resultado) {
    crInserts.push({
      id: uuidv4(),
      proprietario_id: PROPRIETARIO_ID,
      tipo: TIPO_SAIDA,
      descricao: `CR: ${conta.descricao}`,
      valor: parseFloat(conta.valor_total),
      data_lancamento: data_ref,
      id_conta_contabil: conta.id_conta_resultado,
      origem: ORIGEM_CR,
      referencia_id: conta.id,
      created_at: new Date().toISOString()
    });
  }
});

console.log(`Total CRs processadas: ${crCount}`);
console.log(`Total Lançamentos CR: ${crInserts.length}`);

// Build SQL INSERT for CRs
const crSQL = `INSERT INTO lancamentos_contabeis (id, proprietario_id, tipo, descricao, valor, data_lancamento, id_conta_contabil, origem, referencia_id, created_at, updated_at)
VALUES
${crInserts.map(l => {
  const valor = typeof l.valor === 'number' ? l.valor : parseFloat(l.valor);
  return `('${l.id}', '${l.proprietario_id}', '${l.tipo}', '${l.descricao.replace(/'/g, "''")}', ${valor}, '${l.data_lancamento}', '${l.id_conta_contabil}', '${l.origem}', '${l.referencia_id}', '${l.created_at}', NOW())`;
}).join(',\n')};`;

// SQL INSERT for Recebimentos - only records with valid accounts
const recInserts = [];
let recCount = 0;

rec.forEach(recebimento => {
  // Must have id_conta_contabil for bank entry AND historico_id for patrimonial account
  if (!recebimento.id_conta_contabil && !recebimento.historico_id) return;
  
  const data_ref = recebimento.data_recebimento;
  const valor = parseFloat(recebimento.valor_recebido);
  
  // Lançamento 1: ENTRADA na conta bancária
  if (recebimento.id_conta_contabil) {
    recInserts.push({
      id: uuidv4(),
      proprietario_id: PROPRIETARIO_ID,
      tipo: TIPO_ENTRADA,
      descricao: `Recebimento: ${recebimento.forma_pagamento}`,
      valor: valor,
      data_lancamento: data_ref,
      id_conta_contabil: recebimento.id_conta_contabil,
      origem: ORIGEM_REC,
      referencia_id: recebimento.id,
      created_at: new Date().toISOString()
    });
  }
  
  // Lançamento 2: SAIDA na conta patrimonial (Clientes a Receber) - use historico_id as placeholder
  if (recebimento.historico_id) {
    recInserts.push({
      id: uuidv4(),
      proprietario_id: PROPRIETARIO_ID,
      tipo: TIPO_SAIDA,
      descricao: `Recebimento: ${recebimento.forma_pagamento}`,
      valor: valor,
      data_lancamento: data_ref,
      id_conta_contabil: recebimento.historico_id, // Using historico_id as fallback
      origem: ORIGEM_REC,
      referencia_id: recebimento.id,
      created_at: new Date().toISOString()
    });
  }
  
  recCount++;
});

console.log(`Total Recebimentos processados: ${recCount}`);
console.log(`Total Lançamentos Recebimentos: ${recInserts.length}`);

// Build SQL INSERT for Recebimentos
const recSQL = `INSERT INTO lancamentos_contabeis (id, proprietario_id, tipo, descricao, valor, data_lancamento, id_conta_contabil, origem, referencia_id, created_at, updated_at)
VALUES
${recInserts.map(l => {
  const valor = typeof l.valor === 'number' ? l.valor : parseFloat(l.valor);
  return `('${l.id}', '${l.proprietario_id}', '${l.tipo}', '${l.descricao.replace(/'/g, "''")}', ${valor}, '${l.data_lancamento}', '${l.id_conta_contabil}', '${l.origem}', '${l.referencia_id}', '${l.created_at}', NOW())`;
}).join(',\n')};`;

// Output
console.log('\n\n=== SQL 1: LANÇAMENTOS CONTÁBEIS PARA CONTAS A RECEBER (52 lançamentos) ===\n');
console.log(crSQL);

console.log('\n\n=== SQL 2: LANÇAMENTOS CONTÁBEIS PARA RECEBIMENTOS (até 32 lançamentos) ===\n');
console.log(recSQL);
