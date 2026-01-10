-- Migration: Garantir trigger para inserir em tbl_clientes quando usuário Auth é criado
-- Data: 2026-01-09
-- Descrição: Recria o trigger route_new_user para garantir inserção automática em tbl_clientes
--            MODIFICADO: Não insere se user_metadata estiver vazio (Edge Function faz insert direto)

-- 1. Recriar função de roteamento de novos usuários
CREATE OR REPLACE FUNCTION public.route_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  user_role TEXT;
  user_nome TEXT;
  p_proprietario_id UUID;
  p_plano_id UUID;
  p_permissoes JSONB;
  p_limite_usuarios INTEGER;
  v_admin_id UUID;
  
  -- Valores padrão para tbl_usuarios/admin_usuarios (NOT NULL)
  v_salario NUMERIC := 0.00;
  v_horas_semanais INTEGER := 44;
  v_horas_mensais INTEGER := 220;
  v_dias_folga_fixos TEXT[] := '{}'::text[];
  v_folga_domingo_obrigatoria BOOLEAN := TRUE;
  v_permissoes_usuario JSONB := '{"visualizar_proprio_ponto": true}'::jsonb;
  
  v_is_proprietario_admin BOOLEAN := FALSE;
BEGIN
  -- Se user_metadata está vazio, significa que a Edge Function vai fazer o insert
  -- Então retornamos sem fazer nada para evitar duplicate key error
  IF new.raw_user_meta_data IS NULL OR new.raw_user_meta_data = '{}'::jsonb THEN
    RETURN new;
  END IF;

  user_role := COALESCE(new.raw_user_meta_data ->> 'role', 'Cliente');
  user_nome := COALESCE(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1));
  
  -- Tenta converter metadados
  BEGIN p_proprietario_id := (new.raw_user_meta_data ->> 'proprietario_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN p_proprietario_id := NULL; END;
  BEGIN p_plano_id := (new.raw_user_meta_data ->> 'plano_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN p_plano_id := NULL; END;
  BEGIN p_permissoes := (new.raw_user_meta_data ->> 'permissoes')::jsonb; EXCEPTION WHEN others THEN p_permissoes := NULL; END;
  p_limite_usuarios := COALESCE((new.raw_user_meta_data ->> 'limite_usuarios')::integer, 5);

  -- Busca o primeiro Admin (para atribuição de clientes)
  SELECT id INTO v_admin_id FROM public.tbl_admins LIMIT 1;

  IF user_role = 'Admin' THEN
    INSERT INTO public.tbl_admins (id, nome, email) VALUES (new.id, user_nome, new.email)
    ON CONFLICT (id) DO NOTHING;
  ELSIF user_role = 'Cliente' THEN
    INSERT INTO public.tbl_clientes (id, nome, email, aprovado, permissoes, plano_id, limite_usuarios, admin_id, data_fim_acesso) 
    VALUES (
        new.id, 
        user_nome, 
        new.email, 
        COALESCE((new.raw_user_meta_data ->> 'aprovado')::boolean, p_plano_id IS NOT NULL), 
        COALESCE(p_permissoes, '{"bancos": true, "importar": true, "relatorios": true, "conciliacao": true, "contas_pagar": true, "plano_contas": true, "configuracoes": true, "contas_receber": true, "ponto_eletronico": true}'::jsonb),
        p_plano_id,
        p_limite_usuarios,
        v_admin_id,
        (new.raw_user_meta_data ->> 'data_fim_acesso')::timestamp with time zone
    )
    ON CONFLICT (id) DO NOTHING;
  ELSIF user_role = 'Usuario' THEN
    -- Verifica se o proprietário é um Admin
    IF p_proprietario_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = p_proprietario_id) THEN
        v_is_proprietario_admin := TRUE;
    END IF;

    IF v_is_proprietario_admin THEN
        -- Roteia para admin_usuarios (Usuário do Admin)
        INSERT INTO public.admin_usuarios (
            id, 
            admin_id, 
            nome, 
            email, 
            salario, 
            horas_semanais, 
            horas_mensais, 
            dias_folga_fixos, 
            folga_domingo_obrigatoria,
            permissoes
        ) 
        VALUES (
            new.id, 
            p_proprietario_id,
            user_nome, 
            new.email, 
            v_salario, 
            v_horas_semanais, 
            v_horas_mensais, 
            v_dias_folga_fixos, 
            v_folga_domingo_obrigatoria,
            COALESCE(p_permissoes, v_permissoes_usuario)
        )
        ON CONFLICT (id) DO NOTHING;
    ELSE
        -- Roteia para tbl_usuarios (Usuário do Cliente)
        INSERT INTO public.tbl_usuarios (
            id, 
            nome, 
            email, 
            cliente_id, 
            salario, 
            horas_semanais, 
            horas_mensais, 
            dias_folga_fixos, 
            folga_domingo_obrigatoria,
            permissoes
        ) 
        VALUES (
            new.id, 
            user_nome, 
            new.email, 
            p_proprietario_id,
            v_salario, 
            v_horas_semanais, 
            v_horas_mensais, 
            v_dias_folga_fixos, 
            v_folga_domingo_obrigatoria,
            COALESCE(p_permissoes, v_permissoes_usuario)
        )
        ON CONFLICT (id) DO NOTHING;
    END IF;
  ELSE
    RAISE EXCEPTION 'Papel de usuário inválido: %', user_role;
  END IF;
  
  RETURN new;
END;
$function$;

-- 2. Recriar trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.route_new_user();
