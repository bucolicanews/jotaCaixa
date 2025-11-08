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
    let userId = clienteCrId; // Tentativa inicial de usar o mesmo ID

    // 2. Tentar criar o usuário no Auth
    const { error: signUpError } = await supabaseService.auth.admin.createUser({
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
        if (signUpError.message === 'User already registered') {
            // Usuário já existe, buscar o ID real
            const { data: authUser, error: authError } = await supabaseService.auth.admin.getUserByEmail(clientEmail);
            if (authError || !authUser?.user) {
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

    // 4. Enviar o link de redefinição de senha (convite)
    const { error: resetError } = await supabaseService.auth.admin.generateLink({
        type: 'recovery',
        email: clientEmail,
        options: {
            redirectTo: `${baseUrl}/atualizar-senha`,
        }
    });
    
    if (resetError) {
        console.error('Reset Password Link Error:', resetError);
        // Não é um erro fatal, mas deve ser reportado
    }
    
    // 5. Deletar o registro da tabela 'clientes' (CR)
    const { error: deleteCrError } = await supabaseService
        .from('clientes')
        .delete()
        .eq('id', clienteCrId);
        
    if (deleteCrError) {
        console.error('Delete CR Error:', deleteCrError);
        // Não é um erro fatal, apenas um aviso
    }

    return new Response(JSON.stringify({ success: true, message: 'Convite enviado e cliente promovido.' }), {
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