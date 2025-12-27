-- Dropa a função se ela já existir para garantir uma redefinição limpa
DROP FUNCTION IF EXISTS public.get_admin_id();

-- Cria a função `get_admin_id` que busca o ID do administrador para o usuário autenticado.
-- Esta função é central para as políticas de Row Level Security (RLS) em um ambiente multi-tenant.
-- A lógica assume dois tipos de usuários:
-- 1. Administradores (Admins): Gerenciam outros usuários e seus próprios dados. Para eles, o `admin_id` é o seu próprio `user_id` (auth.uid()).
-- 2. Usuários gerenciados: São associados a um admin. O `admin_id` deles é o ID do admin que os gerencia.

-- A função primeiro procura o `user_id` do usuário autenticado na tabela `admin_user_lookup`.
-- - Se um registro for encontrado, significa que o usuário é gerenciado, e a função retorna o `admin_id` correspondente.
-- - Se nenhum registro for encontrado, a função assume que o usuário é um administrador e retorna o `auth.uid()` do próprio usuário como `admin_id`.

-- SECURITY DEFINER é usado para que a função execute com as permissões do seu criador (geralmente, o superusuário),
-- permitindo que ela acesse `admin_user_lookup` independentemente das permissões RLS do usuário que a invoca.
CREATE OR REPLACE FUNCTION public.get_admin_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_uuid uuid;
BEGIN
  -- Tenta obter o admin_id da tabela de lookup para o usuário atual
  SELECT admin_id INTO admin_uuid
  FROM public.admin_user_lookup
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- Se não encontrar (ou seja, o usuário não é gerenciado por outro),
  -- assume que ele é o próprio admin e retorna seu próprio uid.
  IF admin_uuid IS NULL THEN
    RETURN auth.uid();
  END IF;

  -- Retorna o admin_id encontrado
  RETURN admin_uuid;
END;
$$;
