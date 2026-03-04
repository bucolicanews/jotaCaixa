import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { nome, email, plano_id, data_fim_acesso, tipo_cliente, admin_id } = await req.json();

    console.log('Criando cliente:', { nome, email, plano_id, tipo_cliente, admin_id });

    if (!nome || !email || !plano_id || !tipo_cliente) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios ausentes: nome, email, plano_id, tipo_cliente' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Verificar se email já existe em tbl_clientes
    const { data: existingClient } = await supabaseAdmin
      .from('tbl_clientes')
      .select('id, nome')
      .eq('email', email)
      .maybeSingle();

    if (existingClient) {
      return new Response(
        JSON.stringify({ error: `Email já cadastrado para o cliente "${existingClient.nome}"` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Buscar permissões do plano
    const { data: plano, error: planoError } = await supabaseAdmin
      .from('planos')
      .select('permissoes')
      .eq('id', plano_id)
      .maybeSingle();

    if (planoError) {
      console.error('Erro ao buscar plano:', planoError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar plano: ' + planoError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!plano) {
      return new Response(
        JSON.stringify({ error: 'Plano não encontrado. Verifique se o plano selecionado ainda existe.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Buscar admin_id
    const { data: adminData } = await supabaseAdmin
      .from('tbl_admins')
      .select('id')
      .limit(1)
      .maybeSingle();

    const adminIdToUse = adminData?.id || admin_id;

    // 4. Criar usuário no Auth — se já existir, reutiliza
    const tempPassword = crypto.randomUUID() + crypto.randomUUID();

    console.log('Criando usuário no Auth...');

    let userId: string;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {},
    });

    if (authError) {
      const jaExiste =
        authError.message?.includes('already been registered') ||
        authError.message?.includes('already exists') ||
        authError.message?.includes('duplicate');

      if (jaExiste) {
        // Usuário existe no Auth mas não em tbl_clientes — busca o id existente
        console.log('Usuário já existe no Auth, buscando ID para reaproveitar...');
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listError) {
          return new Response(
            JSON.stringify({ error: 'Erro ao localizar usuário existente: ' + listError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const found = users?.find(u => u.email === email);
        if (!found) {
          return new Response(
            JSON.stringify({ error: `Email "${email}" já está no sistema de autenticação mas não foi possível localizá-lo.` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        userId = found.id;
        console.log('Usuário Auth reutilizado:', userId);
      } else {
        console.error('Erro ao criar usuário no Auth:', authError);
        return new Response(
          JSON.stringify({ error: 'Erro ao criar usuário: ' + authError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      if (!authData.user) {
        return new Response(
          JSON.stringify({ error: 'Usuário não foi criado pelo servidor de autenticação.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = authData.user.id;
      console.log('Usuário criado no Auth:', userId);
    }

    // 5. Inserir em tbl_clientes
    console.log('Inserindo em tbl_clientes...');

    const { error: insertError } = await supabaseAdmin
      .from('tbl_clientes')
      .insert({
        id: userId,
        nome,
        email,
        aprovado: true,
        limite_usuarios: 5,
        permissoes: plano.permissoes,
        plano_id,
        data_fim_acesso: data_fim_acesso || null,
        tipo_cliente: `${tipo_cliente}_Avulso`,
        admin_id: adminIdToUse,
        criado_em: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Erro ao inserir em tbl_clientes:', insertError);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar cliente: ' + insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Cliente inserido com sucesso');

    // 6. Gerar link de recuperação de senha
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    if (resetError) {
      console.error('Aviso: Falha ao gerar link de recuperação:', resetError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email,
        message: 'Cliente cadastrado com sucesso',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Erro geral ao criar cliente:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
