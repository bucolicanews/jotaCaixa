import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jqoirlswewggyppgvgnv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impxb2lybHN3ZXdnZ3lwcGd2Z25lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk1MDI3MzYsImV4cCI6MTg5NzI2OTEzNn0.BXIWLHqWvS1S5d1l1GvpDc7c19-F0JhE7yYGEJ_91UY';

const client = createClient(supabaseUrl, supabaseAnonKey);

async function executeRestore() {
  try {
    const sql = fs.readFileSync('./restore_lancamentos.sql', 'utf-8');
    
    // Split by semicolons and execute each statement
    const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'));
    
    console.log(`Total de comandos: ${statements.length}`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const [index, statement] of statements.entries()) {
      const trimmedStmt = statement.trim();
      if (!trimmedStmt) continue;
      
      try {
        const { data, error } = await client.rpc('exec_sql', { sql_text: trimmedStmt });
        
        if (error) {
          console.error(`[${index + 1}] Erro:`, error.message);
          errorCount++;
        } else {
          successCount++;
          if ((index + 1) % 10 === 0) {
            console.log(`[${index + 1}/${statements.length}] Executados com sucesso`);
          }
        }
      } catch (err) {
        console.error(`[${index + 1}] Erro de execução:`, err.message);
        errorCount++;
      }
    }
    
    console.log(`\n✓ Sucesso: ${successCount} comandos`);
    console.log(`✗ Erro: ${errorCount} comandos`);
    
  } catch (error) {
    console.error('Erro ao ler arquivo SQL:', error.message);
  }
}

executeRestore();
