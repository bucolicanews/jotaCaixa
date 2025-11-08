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
    const { clienteCrId, adminId, baseUrl } = body;

    if (!clienteCrId || !adminId || !baseUrl) {
      return new Response(JSON.stringify({ error: 'Missing required fields (clienteCrId, adminId, baseUrl)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Inicializar Supabase Client com SERVICE ROLE KEY (ignora RLS)
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );

    // 1. Buscar dados do cliente na tabela 'clientes' (CR)
    const { data: clienteCr, error: fetchCrError } = await supabaseService
      .from('clientes')
      .select('*')
      .eq('id', clienteCrId)
      .single();

    if (fetchCrError || !clienteCr || !clienteCr.email) {
      return new Response(JSON.stringify({ error: 'Cliente CR não encontrado ou sem email.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const clientEmail = clienteCr.email;
    const clientName = clienteCr.nome;
    let userId = clienteCrId; 
    let userAlreadyExists = false;

    // 2. Tentar criar o usuário no Auth
    const { data: signUpData, error: signUpError } = await supabaseService.auth.admin.createUser({
        email: clientEmail,
        email_confirm: true, // Confirma o email automaticamente
        user_metadata: { 
            role: 'Cliente', 
            nome: clientName, 
            aprovado: false, // Começa como pendente de aprovação
        }
    });
    
    // Se houver erro, verifica se é de duplicidade
    if (signUpError) {
        if (signUpError.message.includes('already registered')) {
            userAlreadyExists = true;
            // Usuário já existe, buscar o ID real
            const { data: authUser, error: authError } = await supabaseService.auth.admin.getUserByEmail(clientEmail);
            if (authError || !authUser?.user) {
                console.error('Auth Get User Error:', authError);
                return new Response(JSON.stringify({ error: 'Usuário já registrado, mas não foi possível obter o ID.' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            userId = authUser.user.id;
        } else {
            // Outro erro fatal
            console.error('Auth Sign Up Error:', signUpError);
            return new Response(JSON.stringify({ error: 'Falha ao criar usuário no Auth: ' + signUpError.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    } else {
        // Se a criação foi bem-sucedida, usa o ID do novo usuário
        userId = signUpData.user.id;
    }
    
    if (!userId) {
        return new Response(JSON.stringify({ error: 'ID do usuário não pôde ser determinado após Auth.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    // 3. Mover dados cadastrais para tbl_clientes (Upsert)
    const clientProfilePayload = {
        id: userId,
        admin_id: adminId,
        nome: clientName,
        email: clientEmail,
        aprovado: false, // Pendente de aprovação
        // Mapeamento de campos cadastrais
        cpf: clienteCr.documento,
        rg: clienteCr.rg,
        telefone: clienteCr.telefone,
        cep: clienteCr.cep,
        endereco: clienteCr.endereco,
        numero: clienteCr.numero,
        complemento: clienteCr.complemento,
        bairro: clienteCr.bairro,
        cidade: clienteCr.cidade,
        estado: clienteCr.estado,
    };
    
    const { error: upsertProfileError } = await supabaseService
        .from('tbl_clientes')
        .upsert(clientProfilePayload, { onConflict: 'id' });

    if (upsertProfileError) {
        console.error('Upsert Profile Error:', upsertProfileError);
        return new Response(JSON.stringify({ error: 'Falha ao criar perfil do cliente no sistema.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 4. NÃO DELETAR o registro da tabela 'clientes' (CR) - Conforme nova regra.
    
    // 5. Retorna sucesso e o email do cliente para que o frontend envie o convite
    return new Response(JSON.stringify({ 
        success: true, 
        message: userAlreadyExists ? 'Cliente já existia, perfil atualizado.' : 'Usuário criado no Auth e perfil atualizado.',
        clientEmail: clientEmail,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in promote-client-to-system:', error);
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});