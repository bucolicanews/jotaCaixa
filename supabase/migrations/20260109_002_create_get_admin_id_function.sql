-- Migration: Criar função get_admin_id_for_current_user
-- Data: 2026-01-09
-- Descrição: Função RPC para obter o admin_id do usuário atual (Admin ou UsuárioAdmin)

CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  admin_id_result uuid;
BEGIN
  current_user_id := auth.uid();
  
  -- Se não há usuário autenticado, retorna null
  IF current_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Verifica se o usuário é Admin direto (tbl_admins)
  SELECT id INTO admin_id_result
  FROM public.tbl_admins
  WHERE id = current_user_id
  LIMIT 1;
  
  IF admin_id_result IS NOT NULL THEN
    RETURN admin_id_result;
  END IF;
  
  -- Verifica se é um UsuárioAdmin (admin_usuarios)
  SELECT admin_id INTO admin_id_result
  FROM public.admin_usuarios
  WHERE id = current_user_id
  LIMIT 1;
  
  RETURN admin_id_result;
END;
$$;

-- Grant execute para usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user() TO authenticated;

COMMENT ON FUNCTION public.get_admin_id_for_current_user() IS 'Retorna o admin_id do usuário atual (Admin ou UsuárioAdmin)';
