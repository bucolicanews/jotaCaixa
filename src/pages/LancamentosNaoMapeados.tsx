import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { UsuarioProfile } from '@/types/usuario';
import { PlanoContas } from '@/types/plano-contas';
import { Historico } from '@/types/historico';
import MapearLancamentosTable from '@/components/calima/MapearLancamentosTable';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface LancamentoNaoMapeado {
    id: string;
    data_movimentacao: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    conta_contabil_id: string | null;
    historico_id: string | null;
    
    // Campos temporários removidos para evitar conflito de tipagem
}

const LancamentosNaoMapeados: React.FC = () => {
    const { perfil, role, carregando: carregandoSessao } = useSessao();
    const navigate = useNavigate();
    
    const [lancamentos, setLancamentos] = useState<LancamentoNaoMapeado[]>([]);
    const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
    const [historicos, setHistoricos] = useState<Historico[]>([]);
    const [carregandoDados, setCarregandoDados] = useState(true);

    const getOwnerId = () => {
        if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
        if (role === 'Usuario') return (perfil as UsuarioProfile)?.proprietario_id;
        return null;
    };
    
    const ownerId = getOwnerId();

    const fetchDados = useCallback(async () => {
        if (!ownerId) {
            setCarregandoDados(false);
            return;
        }
        
        setCarregandoDados(true);
        
        try {
            // 1. Buscar Lançamentos sem conta_contabil_id OU sem historico_id
            const { data: lancamentosData, error: lError } = await supabase
                .from('lancamentos')
                .select('id, data_movimentacao, descricao, valor, tipo, conta_contabil_id, historico_id')
                .eq('proprietario_id', ownerId)
                .or('conta_contabil_id.is.null,historico_id.is.null')
                .order('data_movimentacao', { ascending: false });
                
            if (lError) throw lError;
            setLancamentos(lancamentosData as LancamentoNaoMapeado[]);
            
            // 2. Buscar Contas Contábeis de Resultado (3, 4, 5)
            const { data: pcData, error: pcError } = await supabase
                .from('plano_contas')
                .select('id, Conta, Descricao, Analitica')
                .eq('proprietario_id', ownerId)
                .eq('Analitica', 'Sim')
                .or('Conta.like.3.%,Conta.like.4.%,Conta.like.5.%')
                .order('Conta', { ascending: true });
                
            if (pcError) throw pcError;
            setContasContabeis(pcData as PlanoContas[]);
            
            // 3. Buscar Históricos
            const { data: hData, error: hError } = await supabase
                .from('historicos')
                .select('id, descricao, codigo')
                .eq('proprietario_id', ownerId)
                .order('descricao');
                
            if (hError) throw hError;
            setHistoricos(hData as Historico[]);

        } catch (error: any) {
            showError('Erro ao carregar dados pendentes: ' + error.message);
            setLancamentos([]);
            setContasContabeis([]);
            setHistoricos([]);
        } finally {
            setCarregandoDados(false);
        }
    }, [ownerId]);

    useEffect(() => {
        if (!carregandoSessao && ownerId) {
            fetchDados();
        }
    }, [carregandoSessao, ownerId, fetchDados]);
    
    const handleSaveComplete = () => {
        fetchDados(); // Recarrega a lista após salvar
    };

    if (carregandoSessao || carregandoDados) {
        return (
            <LayoutPrincipal>
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </LayoutPrincipal>
        );
    }
    
    if (!ownerId) {
        return <LayoutPrincipal><Card><CardContent className="p-6">Você não tem permissão para acessar esta página.</CardContent></Card></LayoutPrincipal>;
    }

    return (
        <LayoutPrincipal>
            <div className="flex items-center mb-6">
                <Button 
                    onClick={() => navigate('/relatorios/calima')} 
                    variant="link" 
                    type="button"
                    className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Voltar para Exportação
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold flex items-center">
                    <AlertTriangle className="w-6 h-6 mr-2 text-yellow-500" /> Mapeamento Contábil Pendente
                </h1>
            </div>
            
            <Card className="mb-6">
                <CardHeader><CardTitle className="text-lg">Instruções</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Os {lancamentos.length} lançamentos abaixo não possuem a Conta Contábil de Resultado ou o Histórico definidos. Mapeie-os para que possam ser incluídos na exportação Calima.
                    </p>
                </CardContent>
            </Card>
            
            {lancamentos.length > 0 ? (
                <MapearLancamentosTable
                    empresaId={ownerId}
                    lancamentosIniciais={lancamentos}
                    contasContabeis={contasContabeis}
                    historicos={historicos}
                    onSaveComplete={handleSaveComplete}
                />
            ) : (
                <Card className="mt-6">
                    <CardContent className="p-6 text-center text-green-600">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
                        Parabéns! Todos os lançamentos estão mapeados.
                    </CardContent>
                </Card>
            )}
        </LayoutPrincipal>
    );
};

export default LancamentosNaoMapeados;