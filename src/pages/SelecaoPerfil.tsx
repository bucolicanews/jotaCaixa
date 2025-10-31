import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, User, Building2, Check, X, Package } from 'lucide-react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { Plano } from '@/types/plano';
import { PERMISSOES_DISPONIVEIS } from '@/config/permissoes';
import { cn } from '@/lib/utils';

const SelecaoPerfil: React.FC = () => {
  const { usuario, role, perfil, carregando, refetch } = useSessao();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  
  const permissoesMap = PERMISSOES_DISPONIVEIS.filter(p => 
    p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto'
  ).map(p => ({
      key: p.key,
      label: p.label,
  }));

  const buscarPlanos = useCallback(async () => {
    setCarregandoPlanos(true);
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .order('preco_mensal', { ascending: true });

    if (error) {
      showError('Erro ao carregar planos: ' + error.message);
      setPlanos([]);
    } else {
      setPlanos(data as Plano[]);
    }
    setCarregandoPlanos(false);
  }, []);

  useEffect(() => {
    buscarPlanos();
  }, [buscarPlanos]);

  // --- Redirecionamento de Segurança ---
  if (carregando || carregandoPlanos) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  const isUnassignedUser = role === 'Usuario' && !(perfil as UsuarioProfile)?.cliente_id;
  const isClientApproved = role === 'Cliente' && (perfil as ClienteProfile)?.aprovado;

  if (role === 'Admin' || isClientApproved) {
    navigate('/painel', { replace: true });
    return null;
  }
  
  // Se o usuário não for Admin, nem Cliente aprovado, e não for um Usuário não vinculado, algo está errado.
  if (!isUnassignedUser && role !== 'Cliente') {
      if (!usuario) {
          navigate('/login', { replace: true });
          return null;
      }
  }
  // -------------------------------------

  const handleSelectProfile = async (plano: Plano) => {
    if (!usuario) return;
    setLoading(true);

    const permissoes = plano.permissoes;
    const nome = perfil?.nome || usuario.email?.split('@')[0] || 'Novo Cliente';
    
    try {
        // 1. Promover/Atualizar o usuário para Cliente na tbl_clientes
        const dataToInsert = {
            id: usuario.id,
            nome: nome,
            email: usuario.email,
            aprovado: true, // Aprovação automática para PF/PJ via vendas
            limite_usuarios: 1, // Limite inicial de 1 para o próprio cliente
            permissoes: permissoes,
            tipo_cliente: plano.tipo_cliente,
            plano_id: plano.id, // Vinculando o plano
        };
        
        // Se for um Usuário não vinculado, precisamos deletá-lo da tbl_usuarios primeiro
        if (isUnassignedUser) {
            await supabase.from('tbl_usuarios').delete().eq('id', usuario.id);
        }
        
        // Inserir/Atualizar na tbl_clientes
        const { error: insertError } = await supabase
            .from('tbl_clientes')
            .upsert(dataToInsert);

        if (insertError) throw insertError;
        
        // 2. Atualizar metadados do Auth para forçar a role 'Cliente'
        const { error: authUpdateError } = await supabase.auth.updateUser({
            data: { role: 'Cliente' }
        });
        
        if (authUpdateError) throw authUpdateError;

        showSuccess(`Plano ${plano.nome} selecionado com sucesso!`);
        await refetch(); // Força a atualização da sessão
        navigate('/painel', { replace: true });

    } catch (error: any) {
        console.error('Erro ao selecionar perfil:', error);
        showError('Falha ao configurar o perfil: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  if (planos.length === 0) {
      return (
        <LayoutPrincipal>
            <Card className="mt-10"><CardContent className="text-center py-8 text-muted-foreground">Nenhum plano de assinatura disponível. Contate o administrador.</CardContent></Card>
        </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      <div className="flex items-center justify-center min-h-[80vh] p-4">
        <Card className="w-full max-w-6xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Selecione seu Plano</CardTitle>
            <CardDescription className="text-lg font-semibold text-green-500">
                Teste Grátis por {planos[0]?.dias_trial || 7} dias!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {planos.map((plano) => (
                  <Card 
                      key={plano.id} 
                      className={cn(
                          "p-4 flex flex-col items-center text-center transition-colors",
                          plano.tipo_cliente === 'PJ' ? "border-primary shadow-lg" : "border-secondary"
                      )}
                  >
                      {plano.tipo_cliente === 'PJ' ? (
                          <Building2 className="w-10 h-10 text-primary mb-3" />
                      ) : (
                          <User className="w-10 h-10 text-primary mb-3" />
                      )}
                      
                      <h3 className="text-xl font-semibold mb-2">{plano.nome} ({plano.tipo_cliente})</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {plano.descricao || (plano.tipo_cliente === 'PJ' ? 'Gestão completa para empresas.' : 'Uso pessoal e microempreendedores.')}
                      </p>
                      
                      <div className="text-4xl font-extrabold text-foreground mb-4">
                          {formatCurrency(plano.preco_mensal)}
                          <span className="text-lg font-medium text-muted-foreground">/mês</span>
                      </div>
                      
                      <div className="space-y-3 flex-1 text-left w-full px-4">
                          <h4 className="font-semibold flex items-center text-primary mb-3">
                              <Package className="w-4 h-4 mr-2" /> Módulos Incluídos:
                          </h4>
                          {permissoesMap.map(p => {
                              const isIncluded = plano.permissoes[p.key] === true;
                              return (
                                  <div key={p.key} className="flex items-center space-x-2">
                                      {isIncluded ? (
                                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                      ) : (
                                          <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                                      )}
                                      <span className={cn("text-sm", !isIncluded && "text-muted-foreground line-through")}>
                                          {p.label}
                                      </span>
                                  </div>
                              );
                          })}
                      </div>
                      
                      <Button 
                          onClick={() => handleSelectProfile(plano)} 
                          disabled={loading}
                          className="w-full mt-6"
                      >
                          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : `Iniciar Trial de ${plano.dias_trial} dias`}
                      </Button>
                  </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </LayoutPrincipal>
  );
};

export default SelecaoPerfil;