import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  'https://jqoirlswewggyppgvgnv.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impxb2lybHN3ZXdnZ3lwcGd2Z25lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk1MDI3MzYsImV4cCI6MTg5NzI2OTEzNn0.BXIWLHqWvS1S5d1l1GvpDc7c19-F0JhE7yYGEJ_91UY'
);

async function main() {
  try {
    const sql = fs.readFileSync('./restore_lancamentos.sql', 'utf-8');
    const lines = sql.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));
    
    let count = 0;
    for (const line of lines) {
      if (line.includes('INSERT INTO')) {
        const fullStmt = line.split(';')[0] + ';';
        const { error } = await supabase.from('lancamentos').insert([{}]);
        if (!error) count++;
      }
    }
    
    console.log(`Inseridos ${count} lançamentos`);
  } catch (err) {
    console.error('Erro:', err);
  }
}

main();
