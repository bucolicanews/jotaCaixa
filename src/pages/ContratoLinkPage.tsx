import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileSignature, ArrowRight } from 'lucide-react';

const ContratoLinkPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [tituloContrato, setTituloContrato] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContratoTitle = useCallback(async () => {
    if (!id) {
      setError('ID do contrato não fornecido.');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    // USANDO RPC PÚBLICA PARA BYPASSAR RLS
    const { data, error: fetchError } = await supabase
      .rpc('get_public_contract_info', { p_contract_id: id });

    if (fetchError) {
      console.error('Erro ao carregar contrato:', fetchError);
      setError('Contrato não encontrado ou erro de conexão.');
    } else if (!data || data.length === 0) {
      setError('Contrato não encontrado ou inválido.');
    } else {
      const contrato = data[0]; // RPC retorna array
      const titulo = contrato.valores_tags_preenchidos?.titulo || 'Documento Importante';
      setTituloContrato(titulo);
      
      if (contrato.status === 'ativo' || contrato.status === 'concluido') {
          // Se já assinado, podemos mostrar mensagem ou redirecionar para visualizar
          // setError('Este contrato já foi assinado.'); // Opcional: deixar clicar para ver
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchContratoTitle();
  }, [fetchContratoTitle]);
  
  const handleRedirectToSign = () => {
      navigate(`/assinar-contrato/${id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 md:p-8">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <FileSignature className="w-10 h-10 mx-auto text-primary mb-2" />
          <CardTitle className="text-2xl">Contrato Pendente de Assinatura</CardTitle>
          <CardDescription className="mt-2">
            {error ? (
                <span className="text-red-500 font-medium">{error}</span>
            ) : (
                <>
                    Você recebeu um documento para assinatura eletrônica.
                    <p className="font-semibold text-foreground mt-1">Documento: {tituloContrato}</p>
                </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleRedirectToSign} 
            disabled={!!error}
            className="w-full h-14 text-lg bg-orange-600 hover:bg-green-700"
          >
            Visualizar Contrato <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          
          <p className="text-xs text-muted-foreground mt-4">
            Você será redirecionado para a página de assinatura segura.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContratoLinkPage;