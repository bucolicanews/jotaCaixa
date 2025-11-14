import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Ferias, RegistroPonto } from '@/types/ponto';
import ReactDOMServer from 'react-dom/server';
import { ClienteProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DetalheFolhaPonto, parseHorasObservacao } from '@/components/ponto/DetalheFolhaPonto';
import { MonthPicker } from '@/components/MonthPicker';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Clock, Filter, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import FolhaPontoPrint from '@/components/ponto/FolhaPontoPrint';
import { usePrint } from '@/hooks/use-print';
import AjustarPontoDialog from '@/components/ponto/AjustarPontoDialog';
import GerenciarFaltas from '@/components/formularios/GerenciarFaltas';
import GerenciarFolgaTrabalhada from '@/components/formularios/GerenciarFolgaTrabalhada';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';


// Define constants used in the snippet
const JORNADA_DIARIA_PADRAO = 8;

// Placeholder for the main component structure
export const FolhaPonto: React.FC = () => {

    // Placeholder state/context variables
    const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
    const { printContent } = usePrint();
    
    const [dataSelecionada, setDataSelecionada] = useState<Date>(startOfMonth(new Date()));
    const [carregandoDados, setCarregandoDados] = useState(true);
    const [funcionarios, setFuncionarios] = useState<any[]>([]);
    const [funcionarioSelecionadoId, setFuncionarioSelecionadoId] = useState<string | null>(null);
    const [registrosDoFuncionario, setRegistrosDoFuncionario] = useState<RegistroPonto[]>([]);
    const [feriasDoFuncionario, setFeriasDoFuncionario] = useState<Ferias[]>([]);
    
    const [ajusteDialogOpen, setAjusteDialogOpen] = useState(false);
    const [faltaAbonoDialogOpen, setFaltaAbonoDialogOpen] = useState(false);
    const [folgaTrabalhadaDialogOpen, setFolgaTrabalhadaDialogOpen] = useState(false);
    const [diaParaAjuste, setDiaParaAjuste] = useState<Date | null>(null);
    const [registroFaltaAbonoInicial, setRegistroFaltaAbonoInicial] = useState<RegistroPonto | null>(null);
    const [registrosDoDiaParaGestao, setRegistrosDoDiaParaGestao] = useState<RegistroPonto[]>([]);
    
    const [filtroNome, setFiltroNome] = useState('');
    
    const isAdmin = role === 'Admin';
    const isCliente = role === 'Cliente';
    
    const getOwnerId = () => {
        if (isAdmin) return usuario?.id || null;
        if (isCliente) return (perfil as ClienteProfile)?.id || null;
        return null;
    };
    
    const ownerId = getOwnerId();
    
    const funcionarioSelecionado = useMemo(() => {
        return funcionarios.find(f => f.id === funcionarioSelecionadoId);
    }, [funcionarios, funcionarioSelecionadoId]);
    
    const isFuncionarioAdmin = funcionarioSelecionado?.admin_id === ownerId && isAdmin;
    const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
    const tabelaFerias = 'ferias';

    const fetchFerias = useCallback(async (funcionarioId: string, data: Date) => {
        const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
        const fimMes = format(endOfMonth(data), 'yyyy-MM-dd');
        
        const { data: feriasRes, error } = await supabase
            .from(tabelaFerias)
            .select('*')
            .eq('funcionario_id', funcionarioId)
            .lte('data_inicio', fimMes)
            .gte('data_fim', inicioMes);

        if (error) {
            showError('Erro ao carregar férias: ' + error.message);
            setFeriasDoFuncionario([]);
        } else {
            const mappedFerias = (feriasRes as Ferias[]).map(f => ({
                ...f,
                status: f.status || 'agendada' 
            }));
            setFeriasDoFuncionario(mappedFerias as Ferias[]);
        }
    }, []);

    const fetchRegistros = useCallback(async (id: string, data: Date) => {
        const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
        const fimMes = format(endOfMonth(data), 'yyyy-MM-dd'); 
        
        const selectColumns = `id, funcionario_id, empresa_id, admin_id, horario_registro, tipo, maps_url, selfie_url, atestado_url, observacao`;

        const { data: registros, error } = await supabase
            .from(tabelaRegistros)
            .select(selectColumns)
            .eq('funcionario_id', id)
            .gte('horario_registro', inicioMes)
            .lte('horario_registro', fimMes)
            .order('horario_registro', { ascending: true });

        if (error) {
            showError('Erro ao carregar registros de ponto: ' + error.message);
            setRegistrosDoFuncionario([]);
        } else {
            const mappedRegistros = (registros as any[]).map(r => ({
                ...r,
                empresa_id: r.admin_id || r.empresa_id,
            })) as RegistroPonto[];
            
            setRegistrosDoFuncionario(mappedRegistros);
        }
    }, [tabelaRegistros]);
    
    const fetchFuncionarios = useCallback(async () => {
        if (!ownerId) return;
        setCarregandoDados(true);
        
        let query = supabase.from('tbl_usuarios').select('id, nome, email, salario, horas_mensais, dias_folga_fixos, folga_domingo_obrigatoria, cliente_id');
        
        if (isAdmin) {
            // Admin busca todos os usuários de todos os clientes
            const { data: clientesData } = await supabase.from('tbl_clientes').select('id');
            const clienteIds = (clientesData || []).map(c => c.id);
            
            // Busca usuários de clientes
            const { data: usersData } = await supabase.from('tbl_usuarios').select('id, nome, email, salario, horas_mensais, dias_folga_fixos, folga_domingo_obrigatoria, cliente_id').in('cliente_id', clienteIds);
            
            // Busca usuários do próprio Admin
            const { data: adminUsersData } = await supabase.from('admin_usuarios').select('id, nome, email, salario, horas_mensais, dias_folga_fixos, folga_domingo_obrigatoria, admin_id');
            
            const allUsers = [
                ...(usersData || []).map(u => ({ ...u, admin_id: null })),
                ...(adminUsersData || []).map(u => ({ ...u, cliente_id: null })),
            ];
            
            setFuncionarios(allUsers);
        } else {
            // Cliente busca apenas seus próprios usuários
            query = query.eq('cliente_id', ownerId);
            const { data } = await query;
            setFuncionarios(data || []);
        }
        
        if (funcionarios.length > 0 && !funcionarioSelecionadoId) {
            setFuncionarioSelecionadoId(funcionarios[0].id);
        }
        
        setCarregandoDados(false);
    }, [ownerId, isAdmin]);

    useEffect(() => {
        if (!carregandoSessao && ownerId) {
            fetchFuncionarios();
        }
    }, [carregandoSessao, ownerId, fetchFuncionarios]);
    
    useEffect(() => {
        if (funcionarioSelecionadoId) {
            fetchRegistros(funcionarioSelecionadoId, dataSelecionada);
            fetchFerias(funcionarioSelecionadoId, dataSelecionada);
        }
    }, [funcionarioSelecionadoId, dataSelecionada, fetchRegistros, fetchFerias]);
    
    const handleSelectFuncionario = (id: string) => {
        setFuncionarioSelecionadoId(id);
    };
    
    const handleEditRegistro = (dia: Date) => {
        setDiaParaAjuste(dia);
        setAjusteDialogOpen(true);
    };
    
    const handleEditFaltaAbono = (registro: RegistroPonto | null, dia: Date) => {
        setRegistroFaltaAbonoInicial(registro);
        setDiaParaAjuste(dia);
        setFaltaAbonoDialogOpen(true);
    };
    
    const handleManageWorkedDayOff = (dia: Date, registros: RegistroPonto[]) => {
        setDiaParaAjuste(dia);
        setRegistrosDoDiaParaGestao(registros);
        setFolgaTrabalhadaDialogOpen(true);
    };
    
    const handleSaveComplete = () => {
        if (funcionarioSelecionadoId) {
            fetchRegistros(funcionarioSelecionadoId, dataSelecionada);
        }
    };
    
    const handleDeleteRegistro = (registroId: string) => {
        setRegistrosDoFuncionario(prev => prev.filter(r => r.id !== registroId));
        // Não precisa de refetch completo, apenas atualização local
    };
    
    const handlePrint = (orientation: 'portrait' | 'landscape') => {
        if (!funcionarioSelecionado) {
            showError('Selecione um funcionário para imprimir.');
            return;
        }
        
        // Placeholder variables needed for the snippet's loop context
        const registrosDoDia: any[] = [{ tipo: 'Falta', observacao: 'Teste', atestado_url: null }]; 
        
        // Removidas as variáveis não utilizadas isFalta, isAbono, minutosAbonados
        
        for (const registro of registrosDoDia) {
            if (registro.tipo === 'Falta' || registro.tipo === 'Abono') {
                // Lógica de processamento de horas removida, pois não é necessária para o printComponent
            }
        }

        const printComponent = (
            <FolhaPontoPrint
                empresaNome={funcionarioSelecionado.nome_empresa || 'Empresa'}
                funcionario={{
                    ...funcionarioSelecionado,
                    registros: registrosDoFuncionario,
                    ferias: feriasDoFuncionario,
                }}
                mes={dataSelecionada}
                diasProcessados={{}} // Placeholder
                totalMinutosTrabalhados={0} // Placeholder
                minutosDiferenca={0} // Placeholder
            />
        );

        const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
        printContent(htmlContent, `Folha de Ponto - ${funcionarioSelecionado.nome} - ${format(dataSelecionada, 'MM/yyyy')}`, orientation);
    };
    
    const funcionarioDetalhe = useMemo(() => {
        if (!funcionarioSelecionado) return null;
        return {
            ...funcionarioSelecionado,
            registros: registrosDoFuncionario,
            ferias: feriasDoFuncionario,
        };
    }, [funcionarioSelecionado, registrosDoFuncionario, feriasDoFuncionario]);
    
    const filteredFuncionarios = funcionarios.filter(f => f.nome.toLowerCase().includes(filtroNome.toLowerCase()));

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
        return (
            <LayoutPrincipal>
                <Card><CardContent className="p-6 text-red-500">Você não está vinculado a uma empresa para gerenciar a folha de ponto.</CardContent></Card>
            </LayoutPrincipal>
        );
    }

    return (
        <LayoutPrincipal>
            <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
                <Clock className="w-6 h-6 mr-2" /> Acompanhar Folha de Ponto
            </h1>
            
            <Card className="mb-6">
                <CardHeader><CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Seleção e Filtros</CardTitle></CardHeader>
                <CardContent className="flex flex-col md:flex-row gap-4">
                    <Select value={funcionarioSelecionadoId || ''} onValueChange={handleSelectFuncionario}>
                        <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue placeholder="Selecione o Funcionário" />
                        </SelectTrigger>
                        <SelectContent>
                            {filteredFuncionarios.map(f => (
                                <SelectItem key={f.id} value={f.id}>
                                    {f.nome} {isAdmin && f.nome_empresa && `(${f.nome_empresa})`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    
                    <Input
                        placeholder="Filtrar por nome..."
                        value={filtroNome}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltroNome(e.target.value)}
                        className="w-full md:w-[200px]"
                    />
                    
                    <MonthPicker
                        date={dataSelecionada}
                        setDate={setDataSelecionada}
                        disabled={!funcionarioSelecionadoId}
                    />
                    
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" disabled={!funcionarioSelecionadoId}>
                                <Printer className="w-4 h-4 mr-2" /> Imprimir
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handlePrint('portrait')}>
                                Imprimir (Retrato)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePrint('landscape')}>
                                Imprimir (Paisagem)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardContent>
            </Card>
            
            {funcionarioDetalhe ? (
                <DetalheFolhaPonto
                    funcionario={funcionarioDetalhe}
                    mes={dataSelecionada}
                    onEditRegistro={handleEditRegistro}
                    onEditFaltaAbono={handleEditFaltaAbono}
                    onDeleteRegistro={handleDeleteRegistro}
                    onManageWorkedDayOff={handleManageWorkedDayOff}
                />
            ) : (
                <Card className="mt-6">
                    <CardContent className="p-6 text-center text-muted-foreground">
                        Selecione um funcionário para visualizar a folha de ponto.
                    </CardContent>
                </Card>
            )}
            
            {/* Diálogos de Gestão */}
            {funcionarioSelecionado && diaParaAjuste && (
                <>
                    <AjustarPontoDialog
                        open={ajusteDialogOpen}
                        onOpenChange={setAjusteDialogOpen}
                        funcionario={{ 
                            id: funcionarioSelecionado.id, 
                            nome: funcionarioSelecionado.nome, 
                            empresa_id: funcionarioSelecionado.cliente_id || funcionarioSelecionado.admin_id,
                            isFuncionarioAdmin: isFuncionarioAdmin,
                        }}
                        dia={diaParaAjuste}
                        registrosIniciais={registrosDoFuncionario.filter(r => format(parseISO(r.horario_registro), 'yyyy-MM-dd') === format(diaParaAjuste, 'yyyy-MM-dd'))}
                        onSaveComplete={handleSaveComplete}
                    />
                    <GerenciarFaltas
                        open={faltaAbonoDialogOpen}
                        onOpenChange={setFaltaAbonoDialogOpen}
                        funcionario={{ 
                            id: funcionarioSelecionado.id, 
                            nome: funcionarioSelecionado.nome, 
                            empresa_id: funcionarioSelecionado.cliente_id || funcionarioSelecionado.admin_id,
                            isFuncionarioAdmin: isFuncionarioAdmin,
                        }}
                        dataFalta={diaParaAjuste}
                        registroInicial={registroFaltaAbonoInicial}
                        onFaltaRegistrada={handleSaveComplete}
                    />
                    <GerenciarFolgaTrabalhada
                        open={folgaTrabalhadaDialogOpen}
                        onOpenChange={setFolgaTrabalhadaDialogOpen}
                        funcionario={{ 
                            id: funcionarioSelecionado.id, 
                            nome: funcionarioSelecionado.nome, 
                            empresa_id: funcionarioSelecionado.cliente_id || funcionarioSelecionado.admin_id,
                            isFuncionarioAdmin: isFuncionarioAdmin,
                        }}
                        dia={diaParaAjuste}
                        registrosDoDia={registrosDoDiaParaGestao}
                        onSaveComplete={handleSaveComplete}
                    />
                </>
            )}
        </LayoutPrincipal>
    );
};