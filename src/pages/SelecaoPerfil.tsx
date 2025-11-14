import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, User, Building2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

interface ClienteSimples {
    id: string;
    nome: string;
    aprovado: boolean;
}

const SelecaoPerfil: React.FC = () => {
  const { usuario, perfil, role, carregando, refetch } = useSessao();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<ClienteSimples[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [clienteSelecionado, setClienteSelecionado] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isUnassignedUser = role === 'Usuario' && !(perfil as UsuarioProfile)?.cliente_id; // FIX: cliente_id
  const isClientApproved = role === 'Cliente' && (perfil as ClienteProfile)?.aprovado;

  // Se o usuário não for um Usuário não vinculado, redireciona imediatamente
  useEffect(() => {
    if (!carregando && usuario && !isUnassignedUser && !isClientApproved) {
        navigate('/painel', { replace: true });
    }
  }, [carregando, usuario, isUnassignedUser, isClientApproved, navigate]);

  const fetchClientes = useCallback(async () => {
    if (!usuario || !isUnassignedUser) return;
    
    setCarregandoClientes(true);
    
    // Busca todos os clientes aprovados no sistema
    const { data, error } = await supabase
        .from('tbl_clientes')
        .select('id, nome, aprovado')
        .eq('aprovado', true)
        .order('nome');

    if (error) {
        showError('Erro ao carregar lista de empresas: ' + error.message);
        setClientes([]);
    } else {
        setClientes(data as ClienteSimples[]);
    }
    setCarregandoClientes(false);
  }, [usuario, isUnassignedUser]);

  useEffect(() => {
    if (!carregando && isUnassignedUser) {
        fetchClientes();
    }
  }, [carregando, isUnassignedUser, fetchClientes]);

  const handleVincular = async () => {
    if (!clienteSelecionado || !usuario?.id) {
        showError('Selecione uma empresa para vincular.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 1. Atualiza o perfil do usuário na tbl_usuarios
        const { error } = await supabase
            .from('tbl_usuarios')
            .update({ cliente_id: clienteSelecionado }) // FIX: cliente_id
            .eq('id', usuario.id);
            
        if (error) throw error;
        
        showSuccess('Usuário vinculado com sucesso!');
        await refetch(); // Recarrega a sessão para atualizar o perfil
        navigate('/painel', { replace: true });
        
    } catch (error: any) {
        showError('Falha ao vincular usuário: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (carregando || carregandoClientes) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!isUnassignedUser) {
      // Se o usuário já está vinculado ou é Cliente/Admin, ele não deve ver esta tela.
      return null; 
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md w-full space-y-8">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Vincular Usuário à Empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground text-center">
            Seu perfil de usuário precisa ser vinculado a uma empresa ativa para acessar o sistema.
          </p>
          
          <div className="space-y-2">
            <label htmlFor="empresa-select" className="text-sm font-medium flex items-center">
                <Building2 className="w-4 h-4 mr-2" /> Selecione a Empresa
            </label>
            <select
              id="empresa-select"
              value={clienteSelecionado || ''}
              onChange={(e) => setClienteSelecionado(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={isSubmitting}
            >
              <option value="" disabled>-- Selecione uma empresa --</option>
              {clientes.map(cliente => (
                <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
              ))}
            </select>
          </div>
          
          <Button 
            onClick={handleVincular} 
            disabled={!clienteSelecionado || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <User className="mr-2 h-4 w-4" />}
            Vincular e Acessar
          </Button>
          
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
              <p>Sua empresa não está na lista?</p>
              <Button variant="link" onClick={() => navigate('/cadastrar-empresa')} disabled={isSubmitting}>
                  Cadastrar Nova Empresa
              </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SelecaoPerfil;