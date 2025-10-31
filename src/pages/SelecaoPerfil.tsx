import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, User, Building2, Check, X } from 'lucide-react';
import { PERMISSOES_PF, PERMISSOES_PJ } from '@/config/permissoes-padrao';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { UsuarioProfile } from '@/types/usuario';

const SelecaoPerfil: React.FC = () => {
  const { usuario, role, perfil, carregando, refetch } = useSessao();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  // Redireciona se o perfil já estiver definido (Admin ou Cliente)
  if (role === 'Admin' || (role === 'Cliente' && perfil && 'aprovado' in perfil)) {
    navigate('/painel', { replace: true });
    return null;
  }
  
  // Esta página só deve ser acessível por um Usuário não vinculado ou um Cliente pendente sem plano definido.
  const isUnassignedUser = role === 'Usuario' && !(perfil as UsuarioProfile)?.cliente_id;
  const isPendingClient = role === 'Cliente' && perfil && !('plano_id' in perfil); // Cliente sem plano definido

  if (!isUnassignedUser && !isPendingClient) {
      // Se o usuário já é um Cliente pendente com plano, ele deve ir para a tela de aprovação.
      if (role === 'Cliente') {
          navigate('/painel', { replace: true });
          return null;
      }
      // Se for um usuário logado sem perfil claro, mas não é 'Usuario' não vinculado, algo está errado.
      if (!usuario) {
          navigate('/login', { replace: true });
          return null;
      }
  }

  const handleSelectProfile = async (tipo: 'PF' | 'PJ') => {
    if (!usuario) return;
    setLoading(true);

    const permissoes = tipo === 'PF' ? PERMISSOES_PF : PERMISSOES_PJ;
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
            tipo_cliente: tipo, // Adicionando o tipo de cliente
            // plano_id será null por enquanto, até implementarmos a tabela de planos
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

        showSuccess(`Perfil ${tipo} selecionado com sucesso!`);
        await refetch(); // Força a atualização da sessão
        navigate('/painel', { replace: true });

    } catch (error: any) {
        console.error('Erro ao selecionar perfil:', error);
        showError('Falha ao configurar o perfil: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <LayoutPrincipal>
      <div className="flex items-center justify-center min-h-[80vh] p-4">
        <Card className="w-full max-w-3xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Selecione seu Perfil</CardTitle>
            <CardDescription>
              Para começar seu teste grátis, escolha o tipo de perfil que melhor se encaixa no seu uso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Opção Pessoa Física */}
              <Card className="p-4 flex flex-col items-center text-center hover:border-primary transition-colors">
                <User className="w-10 h-10 text-primary mb-3" />
                <h3 className="text-xl font-semibold mb-2">Pessoa Física (PF)</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Ideal para uso pessoal ou microempreendedores individuais.
                </p>
                <ul className="text-left text-sm space-y-1 mb-6">
                    <li><Check className="w-4 h-4 text-green-500 inline mr-2" /> Contas a Pagar/Receber</li>
                    <li><Check className="w-4 h-4 text-green-500 inline mr-2" /> Cadastro de Clientes</li>
                    <li><Check className="w-4 h-4 text-green-500 inline mr-2" /> Relatórios Básicos</li>
                    <li><X className="w-4 h-4 text-red-500 inline mr-2" /> Gestão de Equipe/Ponto</li>
                </ul>
                <Button 
                  onClick={() => handleSelectProfile('PF')} 
                  disabled={loading}
                  className="w-full mt-auto"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Selecionar PF'}
                </Button>
              </Card>
              
              {/* Opção Pessoa Jurídica */}
              <Card className="p-4 flex flex-col items-center text-center hover:border-primary transition-colors">
                <Building2 className="w-10 h-10 text-primary mb-3" />
                <h3 className="text-xl font-semibold mb-2">Pessoa Jurídica (PJ)</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Para empresas que precisam de gestão completa, equipe e ponto eletrônico.
                </p>
                <ul className="text-left text-sm space-y-1 mb-6">
                    <li><Check className="w-4 h-4 text-green-500 inline mr-2" /> Todos os Módulos Financeiros</li>
                    <li><Check className="w-4 h-4 text-green-500 inline mr-2" /> Gestão de Usuários/Equipe</li>
                    <li><Check className="w-4 h-4 text-green-500 inline mr-2" /> Ponto Eletrônico</li>
                    <li><Check className="w-4 h-4 text-green-500 inline mr-2" /> Contratos e Tags</li>
                </ul>
                <Button 
                  onClick={() => handleSelectProfile('PJ')} 
                  disabled={loading}
                  className="w-full mt-auto"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Selecionar PJ'}
                </Button>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </LayoutPrincipal>
  );
};

export default SelecaoPerfil;