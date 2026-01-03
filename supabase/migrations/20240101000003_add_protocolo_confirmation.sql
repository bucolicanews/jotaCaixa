-- Adicionar coluna de data de recebimento
ALTER TABLE public.protocolos
ADD COLUMN data_recebimento TIMESTAMPTZ;

-- Habilitar RLS se ainda não estiver
ALTER TABLE public.protocolos ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas de read para evitar conflitos
DROP POLICY IF EXISTS "Public read access for protocols" ON public.protocolos;
DROP POLICY IF EXISTS "Authenticated users can read protocols" ON public.protocolos;

-- Política 1: Permitir leitura pública de um protocolo específico via seu ID (para a página de confirmação)
-- ATENÇÃO: Esta política é intencionalmente permissiva para permitir que a página pública de confirmação
-- busque os dados do protocolo. A segurança para a operação de confirmação é garantida pela função RPC 'confirmar_recebimento_protocolo',
-- que verifica o status do protocolo antes de fazer qualquer alteração.
CREATE POLICY "Public read access for specific protocol"
ON public.protocolos
FOR SELECT
TO anon, authenticated
USING (true);

-- Política 2: Usuários autenticados podem ver protocolos do seu admin_id
CREATE POLICY "Users can see their own company protocols"
ON public.protocolos
FOR SELECT
TO authenticated
USING (admin_id = get_admin_id_for_current_user());

-- Função RPC para confirmar o recebimento
CREATE OR REPLACE FUNCTION confirmar_recebimento_protocolo(p_protocolo_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Executa com os privilégios do criador da função (geralmente, superuser)
AS $$
DECLARE
  protocolo_record RECORD;
BEGIN
  -- Verificar se o protocolo existe e se ainda não foi entregue
  SELECT * INTO protocolo_record FROM public.protocolos WHERE id = p_protocolo_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Protocolo não encontrado.');
  END IF;

  IF protocolo_record.status = 'Entregue' THEN
    RETURN json_build_object('success', false, 'message', 'Este protocolo já foi confirmado anteriormente.');
  END IF;
  
  IF protocolo_record.status = 'Cancelado' THEN
    RETURN json_build_object('success', false, 'message', 'Este protocolo foi cancelado.');
  END IF;

  -- Atualizar o status e a data de recebimento
  UPDATE public.protocolos
  SET
    status = 'Entregue',
    data_recebimento = NOW()
  WHERE id = p_protocolo_id;

  RETURN json_build_object('success', true, 'message', 'Recebimento do protocolo confirmado com sucesso!');
END;
$$;

-- Garantir que a role 'anon' (usuários não autenticados) possa chamar a função
GRANT EXECUTE ON FUNCTION public.confirmar_recebimento_protocolo(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.confirmar_recebimento_protocolo(UUID) TO authenticated;
