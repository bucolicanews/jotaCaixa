import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { UsuarioProfile } from '@/types/usuario';

const CadastrarEmpresa = () => {
    const [companyName, setCompanyName] = useState('');
    const [loading, setLoading] = useState(false);
    const { refetch, role, perfil, carregando } = useSessao();
    const navigate = useNavigate();

    if (carregando) {
        return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
    }
    
    // CORREÇÃO: Verifica proprietario_id
    const isUnassignedUser = role === 'Usuario' && !(perfil as UsuarioProfile)?.proprietario_id;

    if (!isUnassignedUser) {
        // Se não for um Usuário não vinculado, redireciona para o painel
        if (role === 'Cliente' || role === 'Admin') {
            navigate('/painel', { replace: true });
            return null;
        }
        // Se for um Usuário já vinculado, não deve estar aqui
        if (role === 'Usuario' && (perfil as UsuarioProfile)?.proprietario_id) {
            navigate('/painel', { replace: true });
            return null;
        }
        // Se for um Cliente pendente, o LayoutPrincipal já cuida disso.
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName.trim()) {
            showError('O nome da empresa é obrigatório.');
            return;
        }
        setLoading(true);
        
        // Nota: O RPC request_client_promotion move o usuário de tbl_usuarios para tbl_clientes.
        const { error } = await supabase.rpc('request_client_promotion', { p_company_name: companyName });

        if (error) {
            showError(`Erro ao cadastrar empresa: ${error.message}`);
        } else {
            showSuccess('Empresa cadastrada com sucesso! Aguarde a aprovação do administrador.');
            await refetch(); // Atualiza a sessão para refletir a nova role de "Cliente pendente"
            navigate('/painel');
        }
        setLoading(false);
    };

    return (
        <LayoutPrincipal>
            <div className="max-w-2xl mx-auto">
                <Card>
                    <CardHeader>
                        <CardTitle>Cadastrar Nova Empresa</CardTitle>
                        <CardDescription>Preencha os dados abaixo. Sua empresa passará por uma aprovação antes de ser ativada.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label htmlFor="company-name">Nome da Empresa</Label>
                                <Input
                                    id="company-name"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    placeholder="Minha Empresa LTDA"
                                    disabled={loading}
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Enviar para Aprovação
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </LayoutPrincipal>
    );
};

export default CadastrarEmpresa;