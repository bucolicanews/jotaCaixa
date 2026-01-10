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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Verificar se email já existe no Auth
    const { data: authUsers, error: authCheckError } = await supabaseAdmin.auth.admin.listUsers();

    if (authCheckError) {
      console.error('Erro ao verificar usuários no Auth:', authCheckError);
    }

    const emailExists = authUsers?.users?.some(user => user.email === email);

    if (emailExists) {
      console.log('Email já existe no Auth:', email);
      return new Response(
        JSON.stringify({ error: 'Email já cadastrado no sistema' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verificar se email já existe em tbl_clientes (fallback)
    const { data: existingClient, error: existingError } = await supabaseAdmin
      .from('tbl_clientes')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingError) {
      console.error('Erro ao verificar email em tbl_clientes:', existingError);
    }

    if (existingClient) {
      console.log('Email já existe em tbl_clientes:', email);
      return new Response(
        JSON.stringify({ error: 'Email já cadastrado na tabela de clientes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Buscar permissões do plano
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
        JSON.stringify({ error: 'Plano não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Buscar admin_id (primeiro admin do sistema)
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('tbl_admins')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (adminError) {
      console.error('Erro ao buscar admin:', adminError);
    }

    const adminIdToUse = adminData?.id || admin_id;

    // 5. Criar usuário no Auth SEM metadados que disparam o trigger
    const tempPassword = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    console.log('Criando usuário no Auth sem disparar trigger...');
    
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {}, // VAZIO para não disparar trigger
    });

    if (authError) {
      console.error('Erro ao criar usuário no Auth:', authError);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar usuário: ' + authError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não foi criado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Usuário criado no Auth:', authData.user.id);

    // 6. Inserir DIRETAMENTE em tbl_clientes (bypassando trigger)
    console.log('Inserindo em tbl_clientes...');

    const { error: insertError } = await supabaseAdmin
      .from('tbl_clientes')
      .insert({
        id: authData.user.id,
        nome,
        email,
        aprovado: true,
        limite_usuarios: 5,
        permissoes: plano.permissoes,
        plano_id,
        data_fim_acesso,
        tipo_cliente: `${tipo_cliente}_Avulso`,
        admin_id: adminIdToUse,
        criado_em: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Erro ao inserir em tbl_clientes:', insertError);
      
      // Se falhou, tentar deletar o usuário do Auth para evitar inconsistência
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      
      return new Response(
        JSON.stringify({ error: 'Erro ao criar cliente: ' + insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Cliente inserido em tbl_clientes com sucesso');

    // 7. Gerar link de recuperação de senha
    console.log('Gerando link de recuperação de senha...');

    const { data: linkData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    if (resetError) {
      console.error('Aviso: Falha ao gerar link de recuperação:', resetError);
    } else {
      console.log('Link de recuperação gerado:', linkData);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authData.user.id,
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
