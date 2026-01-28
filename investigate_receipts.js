import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jqoirlswewggyppgvgnv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impxb2lybHN3ZXdnZ3lwcGd2Z252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMTIxNzgsImV4cCI6MjA3MjU4ODE3OH0.73vN336GSU5zfCOuWvO_zIhg40KTVNhSS8UMhUxMc6A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigateReceipts() {
  console.log('=== Query: Recent receipts for proprietario_id ===\n');
  
  const { data: recent, error: recentError } = await supabase
    .from('admin_recebimentos')
    .select(`
      *,
      admin_parcelas_receber (
        valor_parcela,
        valor_pago,
        status,
        pagbank_charge_id,
        pagbank_status
      )
    `)
    .eq('proprietario_id', '0561e0b6-6a03-412f-bf42-66a420bd4523')
    .order('criado_em', { ascending: false })
    .limit(10);
  
  if (recentError) console.error('Error:', recentError);
  else console.log(JSON.stringify(recent, null, 2));

  console.log('\n\n=== Query: Receipts without lancamento_id ===\n');
  
  const { data: noLancamento, error: noLancamentoError } = await supabase
    .from('admin_recebimentos')
    .select(`
      *,
      admin_parcelas_receber (
        valor_parcela,
        valor_pago,
        status,
        pagbank_charge_id,
        pagbank_status
      )
    `)
    .eq('proprietario_id', '0561e0b6-6a03-412f-bf42-66a420bd4523')
    .is('lancamento_id', null)
    .order('criado_em', { ascending: false });
  
  if (noLancamentoError) console.error('Error:', noLancamentoError);
  else console.log(JSON.stringify(noLancamento, null, 2));
}

investigateReceipts();
