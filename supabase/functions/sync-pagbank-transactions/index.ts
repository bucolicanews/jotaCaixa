import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PagBankClient } from '../create-pagbank-payment/pagbank-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParcelaReceber {
  id: string;
  admin_id: string;
  numero_parcela: number;
  valor_parcela: number;
  data_vencimento: string;
  pagbank_charge_id: string;
  pagbank_status: string;
  status: string;
  admin_contas_receber: {
    id: string;
    descricao: string;
    cliente_id: string;
    id_conta_patrimonial: string | null;
    id_conta_resultado: string | null;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[SYNC] Iniciando sincronização de transações PagBank...');

    const { data: parcelasReceber, error: parcelasError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          id,
          descricao,
          cliente_id,
          id_conta_patrimonial,
          id_conta_resultado
        )
      `)
      .in('pagbank_status', ['WAITING', 'PENDING'])
      .not('pagbank_charge_id', 'is', null)
      .order('data_vencimento', { ascending: true })
      .limit(50);

    if (parcelasError) {
      throw new Error(`Erro ao buscar parcelas: ${parcelasError.message}`);
    }

    if (!parcelasReceber || parcelasReceber.length === 0) {
      console.log('[SYNC] Nenhuma parcela com status WAITING ou PENDING encontrada');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Nenhuma parcela para sincronizar',
          synced: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log(`[SYNC] Encontradas ${parcelasReceber.length} parcelas para verificar`);

    const syncedParcelas: string[] = [];
    const errors: Array<{ parcelaId: string; error: string }> = [];

    for (const parcela of parcelasReceber as ParcelaReceber[]) {
      try {
        const adminId = parcela.admin_id;

        const { data: config, error: configError } = await supabaseAdmin
          .from('configuracoes_pagbank')
          .select('*')
          .eq('proprietario_id', adminId)
          .single();

        if (configError || !config) {
          console.error(`[SYNC] Configuração PagBank não encontrada para admin ${adminId}`);
          errors.push({ parcelaId: parcela.id, error: 'Configuração PagBank não encontrada' });
          continue;
        }

        const pagbankClient = new PagBankClient(config);
        const chargeData = await pagbankClient.getCharge(parcela.pagbank_charge_id);

        console.log(`[SYNC] Parcela ${parcela.id} - Status anterior: ${parcela.pagbank_status}, Novo status: ${chargeData.status}`);

        if (chargeData.status !== parcela.pagbank_status) {
          await supabaseAdmin
            .from('admin_parcelas_receber')
            .update({
              pagbank_status: chargeData.status,
              pagbank_updated_at: new Date().toISOString(),
            })
            .eq('id', parcela.id);

          await supabaseAdmin.from('pagbank_transaction_logs').insert({
            proprietario_id: adminId,
            transaction_type: 'sync',
            pagbank_id: chargeData.id,
            reference_id: `PARCELA_${parcela.id}`,
            status: chargeData.status,
            amount: parcela.valor_parcela,
            response_payload: chargeData,
          });

          console.log(`[SYNC] Status atualizado para parcela ${parcela.id}: ${parcela.pagbank_status} -> ${chargeData.status}`);
          syncedParcelas.push(parcela.id);

          if (chargeData.status === 'PAID' && parcela.status !== 'paga') {
            console.log(`[SYNC] Parcela ${parcela.id} foi PAGA - deve ser processada pelo webhook ou manualmente`);
          }
        } else {
          console.log(`[SYNC] Parcela ${parcela.id} já está atualizada (${chargeData.status})`);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[SYNC] Erro ao processar parcela ${parcela.id}:`, errorMsg);
        errors.push({ parcelaId: parcela.id, error: errorMsg });
      }
    }

    console.log(`[SYNC] Sincronização concluída - ${syncedParcelas.length} atualizadas, ${errors.length} erros`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Sincronização concluída',
        synced: syncedParcelas.length,
        total_checked: parcelasReceber.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[SYNC] Erro geral na sincronização:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
