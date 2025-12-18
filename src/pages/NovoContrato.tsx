import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, FileTextIcon, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { ContratoModelo } from '@/types/contratos';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { useSessao } from '@/hooks/use-sessao';

const NovoContrato: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const navigate = useNavigate();
  const [modelos, setModelos] = useState<ContratoModelo[]>([]);
  const [carregandoModelos, setCarregandoModelos] = useState(true);

  const isCliente = role === 'Cliente';
  const isAdmin = role === 'Admin';
  
  // Memoize o ownerId para evitar recálculos desnecessários
  const getOwnerId = useCallback(() => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  }, [isAdmin, isCliente, role, usuario, perfil]);

  const ownerId = getOwnerId();

  const buscarModelos = useCallback(async () => {
    // Se a sessão ainda carrega, não faz nada
    if (carregandoSessao) return;
    
    // Admin pode ver modelos globais mesmo sem ownerId definido no momento
    if (!role) return;

    setCarregandoModelos(true);
    
    try {
      let query = supabase
        .from('contrato_modelos')
        .select('*')
        .order('titulo', { ascending: true });
        
      if (isAdmin) {
        // Admin: Vê modelos da sua "empresa" OU modelos globais (empresa_id is null)
        if (ownerId) {
          query = query.or(`empresa_id.eq.${ownerId},empresa_id.is.null`);
        } else {
          // Fallback caso o ID do admin ainda não esteja disponível
          query = query.is('empresa_id', null);
        }
      } else if (isCliente || role === 'Usuario') {
        if (ownerId) {
          query = query.or(`empresa_id.eq.${ownerId},empresa_id.is.null`);
        } else {
          // Se for cliente/usuário e não tiver ownerId, só vê globais
          query = query.is('empresa_id', null);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setModelos(data as ContratoModelo[]);
    } catch (error: any) {
      console.error('Erro ao buscar modelos:', error);
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } finally {
      setCarregandoModelos(false);
    }
  }, [carregandoSessao, role, isAdmin, isCliente, ownerId]);

  // Efeito principal de busca
  useEffect(() => {
    buscarModelos();
  }, [buscarModelos]);
  
  const handleSelectModel = (modeloId: string) => {
      navigate(`/contratos/preencher/${modeloId}`);
  };

  // Renderização de carregamento
  if (carregandoSessao || (carregandoModelos && modelos.length === 0)) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Carregando modelos...</span>
        </div>
      </LayoutPrincipal>
    );
  }
  
  // Verificação de permissão (após carregar a sessão)
  if (!isAdmin && !isCliente && role !== 'Usuario') {
    return (
      <LayoutPrincipal>
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Você não possui permissão para criar contratos. Entre em contato com o administrador.</p>
          </CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <PlusCircle className="w-6 h-6 mr-2" /> Iniciar Novo Contrato
      </h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">1. Selecione um Modelo</CardTitle>
          <CardDescription>
            {isAdmin ? 'Como administrador, você visualiza modelos globais e da sua conta.' : 'Escolha um modelo de contrato para começar.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modelos.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
                <FileTextIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="mb-4">Nenhum modelo de contrato encontrado.</p>
                <Button asChild variant="outline">
                  <Link to="/contratos/modelos">Criar Primeiro Modelo</Link>
                </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {modelos.map(modelo => (
                <Card 
                  key={modelo.id} 
                  className="hover:border-primary transition-all hover:shadow-md cursor-pointer flex flex-col"
                  onClick={() => handleSelectModel(modelo.id)}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium leading-tight">{modelo.titulo}</CardTitle>
                    <FileTextIcon className="h-5 w-5 text-primary/50 shrink-0" />
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                        {modelo.conteudo_template.replace(/<[^>]*>?/gm, '').substring(0, 120)}...
                    </p>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-full mt-auto"
                        onClick={(e) => {
                          e.stopPropagation(); // Evita clique duplo
                          handleSelectModel(modelo.id);
                        }}
                    >
                        Selecionar Modelo
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