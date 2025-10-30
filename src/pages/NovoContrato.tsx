import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, FileTextIcon, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { ContratoModelo } from '@/types/contratos';
import { ClienteProfile } from '@/types/usuario';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const NovoContrato: React.FC = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const [modelos, setModelos] = useState<ContratoModelo[]>([]);
  const [carregandoModelos, setCarregandoModelos] = useState(true);

  const isCliente = role === 'Cliente';
  const isAdmin = role === 'Admin';
  const empresaId = isCliente ? (perfil as ClienteProfile)?.id : null;

  const buscarModelos = useCallback(async () => {
    if (!role) return;
    setCarregandoModelos(true);
    
    let query = supabase
      .from('contrato_modelos')
      .select('*')
      .order('titulo', { ascending: true });
      
    if (isCliente) {
        // Clientes veem seus próprios modelos e modelos globais (empresa_id is null)
        query = query.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
    } else if (isAdmin) {
        // Admin vê todos
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } else {
      setModelos(data as ContratoModelo[]);
    }
    setCarregandoModelos(false);
  }, [role, isCliente, isAdmin, empresaId]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || isCliente)) {
      buscarModelos();
    }
  }, [carregandoSessao, isAdmin, isCliente, buscarModelos]);

  if (carregandoSessao || carregandoModelos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!isAdmin && !isCliente) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Apenas administradores e clientes podem criar contratos.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <PlusCircle className="w-6 h-6 mr-2" /> Iniciar Novo Contrato
      </h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">1. Selecione um Modelo</CardTitle>
          <CardDescription>Escolha um modelo de contrato para começar a preencher as informações.</CardDescription>
        </CardHeader>
        <CardContent>
          {modelos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
                <FileTextIcon className="w-8 h-8 mx-auto mb-2" />
                <p>Nenhum modelo de contrato disponível. Crie um em <Link to="/contratos/modelos" className="text-primary underline">Gerenciar Modelos</Link>.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {modelos.map(modelo => (
                <Card 
                  key={modelo.id} 
                  className="hover:border-primary transition-colors cursor-pointer"
                  // TODO: Link para a próxima etapa de preenchimento de tags
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium">{modelo.titulo}</CardTitle>
                    <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                        {modelo.conteudo_template.substring(0, 150)}...
                    </p>
                    <Button variant="secondary" size="sm" className="mt-3 w-full">
                        Selecionar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default NovoContrato;