// @ts-nocheck
/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { clienteCrId, adminId } = body;

    if (!clienteCrId || !adminId) {
      return new Response(JSON.stringify({ error: 'Missing required fields (clienteCrId, adminId)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Inicializar Supabase Client com SERVICE ROLE KEY
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    // 1. Buscar dados do Cliente CR
    const { data: clienteCrData, error: fetchCrError } = await supabaseService
        .from('clientes')
        .select('*')
        .eq('id', clienteCrId)
        .single();
        
    if (fetchCrError || !clienteCrData) {
        console.error('Fetch CR Error:', fetchCrError);
        return new Response(JSON.stringify({ error: 'Cliente CR não encontrado.' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    const { nome, email, razao_social, nome_fantasia, documento } = clienteCrData;
    
    if (!email) {
        return new Response(JSON.stringify({ error: 'Cliente CR não possui email para criação de usuário.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    let newUserId: string;
    let tempPassword = crypto.randomUUID();

    // 2. Tentar criar o usuário no Auth (usando service_role)
    const { data: userData, error: authError } = await supabaseService.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { 
            role: 'Cliente', 
            nome: nome, 
            aprovado: false, // Começa como pendente de aprovação
        }
    });

    if (authError) {
        // Se o erro for de usuário já registrado, tentamos buscar o ID existente
        if (authError.message.includes('already registered')) {
            const { data: existingUser, error: fetchUserError } = await supabaseService.auth.admin.getUserByEmail(email);
            if (fetchUserError || !existingUser?.user) {
                console.error('Auth Error: User exists but cannot be fetched.', fetchUserError);
                return new Response(JSON.stringify({ error: 'Usuário já existe, mas falha ao obter ID.' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            newUserId = existingUser.user.id;
        } else {
            console.error('Auth Error:', authError);
            return new Response(JSON.stringify({ error: 'Falha ao criar usuário no Auth: ' + authError.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    } else {
        newUserId = userData.user.id;
    }
    
    // 3. Inserir/Atualizar o perfil na tbl_clientes (usando o ID do Auth)
    const dataToUpsert = {
        id: newUserId,
        admin_id: adminId,
        nome: nome,
        email: email,
        aprovado: false, // Começa como pendente
        limite_usuarios: 5,
        cliente_id_promovido: clienteCrId, 
        razao_social: razao_social,
        nome_fantasia: nome_fantasia,
        documento: documento,
    };
    
    const { error: upsertError } = await supabaseService
        .from('tbl_clientes')
        .upsert(dataToUpsert, { onConflict: 'id' });
        
    if (upsertError) {
        console.error('Upsert Error:', upsertError);
        return new Response(JSON.stringify({ error: 'Falha ao criar perfil na tbl_clientes: ' + upsertError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    // 4. Marcar o cliente CR como cliente do sistema
    const { error: updateCrError } = await supabaseService
        .from('clientes')
        .update({ is_system_client: true })
        .eq('id', clienteCrId);
        
    if (updateCrError) {
        console.error('Update CR Error:', updateCrError);
        // Continua, mas loga o erro
    }

    return new Response(JSON.stringify({ success: true, userId: newUserId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in promote-client-direct:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during promotion.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});