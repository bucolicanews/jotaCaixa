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
    const { email, nome, clienteId, proprietarioId } = body;

    if (!email || !nome || !clienteId || !proprietarioId) {
      return new Response(JSON.stringify({ error: 'Missing required fields (email, nome, clienteId, proprietarioId)' }), {
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
    
    let newUserId: string;
    let tempPassword = crypto.randomUUID();

    // 1. Tentar criar o usuário no Auth
    const { data: userData, error: authError } = await supabaseService.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { 
            role: 'Cliente', 
            nome: nome, 
            aprovado: true,
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
    
    // 2. Inserir/Atualizar o perfil na tbl_clientes
    const dataToUpsert = {
        id: newUserId,
        admin_id: proprietarioId,
        nome: nome,
        email: email,
        aprovado: true,
        limite_usuarios: 5,
        cliente_id_promovido: clienteId, // NOVO CAMPO
        // Permissões e plano serão definidos pelo Admin/Cliente no frontend
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
    
    // 3. Enviar link de redefinição de senha (para que o cliente possa definir a senha)
    // Nota: Isso deve ser feito no frontend, mas a Edge Function pode retornar o ID para que o frontend
    // possa acionar o fluxo de convite/reenvio de link.

    return new Response(JSON.stringify({ success: true, userId: newUserId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in promote-client-to-system:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during promotion.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});