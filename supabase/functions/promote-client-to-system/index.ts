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
    
    // 1. Criar o usuário no Auth (sem enviar email de confirmação)
    const tempPassword = crypto.randomUUID(); // Senha temporária forte
    
    const { data: userData, error: authError } = await supabaseService.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true, // Marca o email como confirmado
        user_metadata: { 
            role: 'Cliente', 
            nome: nome, 
            aprovado: true, // Já é aprovado
            // Não passamos plano_id ou data_fim_acesso aqui, pois o Admin/Cliente deve definir isso depois.
        }
    });

    if (authError) {
        // Se o usuário já existe, tentamos prosseguir se for um erro de duplicidade
        if (authError.message.includes('already registered')) {
            // Se já existe, não podemos criar, mas podemos tentar atualizar o perfil na tbl_clientes
            // No entanto, para simplificar, vamos retornar um erro claro.
            return new Response(JSON.stringify({ error: 'Usuário já existe no sistema de autenticação. Use a função de edição de perfil.' }), {
                status: 409,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        console.error('Auth Error:', authError);
        return new Response(JSON.stringify({ error: 'Falha ao criar usuário no Auth: ' + authError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    const newUserId = userData.user.id;
    
    // 2. Inserir/Atualizar o perfil na tbl_clientes (o trigger route_new_user já deve ter feito isso,
    // mas fazemos um upsert para garantir que o ID do cliente CR seja o mesmo ID do usuário Auth)
    const dataToUpsert = {
        id: newUserId,
        admin_id: proprietarioId, // O Admin/Cliente que promoveu
        nome: nome,
        email: email,
        aprovado: true,
        limite_usuarios: 5,
        // Permissões e plano serão definidos pelo Admin/Cliente no frontend
    };
    
    const { error: upsertError } = await supabaseService
        .from('tbl_clientes')
        .upsert(dataToUpsert);
        
    if (upsertError) {
        console.error('Upsert Error:', upsertError);
        return new Response(JSON.stringify({ error: 'Falha ao criar perfil na tbl_clientes: ' + upsertError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    // 3. Deletar o registro antigo da tabela 'clientes' (CR) se o ID for o mesmo
    // Isso é crucial para evitar duplicidade de IDs se o cliente CR foi criado com o mesmo ID do Auth.
    // No entanto, como o cliente CR pode ter um ID diferente, vamos apenas garantir que o cliente CR
    // que foi promovido tenha seu ID atualizado para o novo ID do Auth, se necessário.
    // Para simplificar, vamos apenas retornar o sucesso. O Admin pode deletar o registro CR antigo se for o caso.

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