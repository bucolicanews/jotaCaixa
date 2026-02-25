// Script para executar o restore de lançamentos via SQL direto
// Uso: node execute_restore_lancamentos.js

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jqoirlswewggyppgvgnv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impxb2lybHN3ZXdnZ3lwcGd2Z25lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk1MDI3MzYsImV4cCI6MTg5NzI2OTEzNn0.BXIWLHqWvS1S5d1l1GvpDc7c19-F0JhE7yYGEJ_91UY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function executeRestoreLancamentos() {
  console.log('📥 Iniciando restauração de lançamentos...\n');

  try {
    // Ler o arquivo SQL
    const sqlContent = fs.readFileSync('./restore_lancamentos.sql', 'utf-8');
    
    // Separar comandos SQL (por ;)
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd && !cmd.startsWith('--'));

    console.log(`📋 Total de comandos a executar: ${commands.length}\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{cmd: number, error: string}> = [];

    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      
      try {
        // Chamar a RPC para executar SQL
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_text: cmd + ';'
        });

        if (error) {
          console.error(`❌ [${i + 1}/${commands.length}] Erro: ${error.message.substring(0, 100)}`);
          errorCount++;
          errors.push({cmd: i + 1, error: error.message});
        } else {
          successCount++;
          if ((i + 1) % 20 === 0) {
            console.log(`✅ [${i + 1}/${commands.length}] Executados com sucesso`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error(`❌ [${i + 1}/${commands.length}] Exceção: ${message.substring(0, 100)}`);
        errorCount++;
        errors.push({cmd: i + 1, error: message});
      }
    }

    // Resumo final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA EXECUÇÃO');
    console.log('='.repeat(60));
    console.log(`✅ Sucesso: ${successCount} comandos`);
    console.log(`❌ Erro: ${errorCount} comandos`);
    console.log(`📈 Taxa de sucesso: ${((successCount / commands.length) * 100).toFixed(2)}%`);

    if (errors.length > 0 && errors.length <= 5) {
      console.log('\n⚠️  Erros:');
      errors.forEach(e => {
        console.log(`  - Comando ${e.cmd}: ${e.error.substring(0, 100)}`);
      });
    }

    console.log('='.repeat(60) + '\n');

    // Validar contagem final de lançamentos
    const { count, error: countError } = await supabase
      .from('lancamentos')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      console.log(`🎯 Total de lançamentos na tabela: ${count}`);
    }

  } catch (err) {
    console.error('💥 Erro ao ler arquivo SQL:', err);
    process.exit(1);
  }
}

executeRestoreLancamentos().catch(err => {
  console.error('💥 Erro geral:', err);
  process.exit(1);
});
