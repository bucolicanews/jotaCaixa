import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Receipt, Filter, Search, AlertTriangle, LayoutGrid, List, Trash2 } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner';
import { useDebounce } from '@/hooks/use-debounce';
import { formatCurrency } from '@/utils/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { useNotasFiscais } from '@/hooks/use-notas-fiscais'; // NOVO HOOK
import NotaFiscalListView from '@/components/notas-fiscais/NotaFiscalListView'; // NOVO COMPONENTE
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import NotaFiscalCard from '@/components/notas-fiscais/NotaFiscalCard'; // IMPORT FALTANTE
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const EmissaoNotas: React.FC = () => {
    const { role, perfil, carregando: carregandoSessao } = useSessao();
    const { ownerId } = useOwner();
    
    const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
    const [filtroStatus, setFiltroStatus] = useState('pendente');
    const [filtroTexto, setFiltroTexto] = useState('');
    const filtroTextoDebounced = useDebounce(filtroTexto, 500);
    const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
    const [selectedParcelaIds, setSelectedParcelaIds] = useState<string[]>([]);

    const {
        parcelasParaNF,
        notasFiscais,
        carregando,
        refetch,
        configNF,
        loadingConfig,
        handleUploadNF,
        handleSendNF,
    } = useNotasFiscais(filtroPeriodo, filtroStatus, filtroTextoDebounced);

    const canAccessPage = role === 'Admin' || role === 'Cliente' || (perfil as any)?.permissoes?.emissao_nf === true;

    const totalPendente = useMemo(() => {
        return parcelasParaNF.reduce((sum, p) => sum + p.valor_parcela, 0);
    }, [parcelasParaNF]);

    const handleToggleSelect = (parcelaId: string, checked: boolean) => {
        setSelectedParcelaIds(prev => 
            checked ? [...prev, parcelaId] : prev.filter(id => id !== parcelaId)
        );
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const eligibleIds = parcelasParaNF
                .filter(p => {
                    const nota = notasFiscais[p.id];
                    return !nota || nota.status === 'Pendente Emissão';
                })
                .map(p => p.id);
            setSelectedParcelaIds(eligibleIds);
        } else {
            setSelectedParcelaIds([]);
        }
    };

    const handleMarkAsNaoEmitir = async () => {
        if (selectedParcelaIds.length === 0) {
            showError("Nenhuma parcela selecionada.");
            return;
        }
        
        try {
            const upserts = selectedParcelaIds.map(parcelaId => {
                const parcela = parcelasParaNF.find(p => p.id === parcelaId);
                return {
                    proprietario_id: ownerId,
                    parcela_id: parcelaId,
                    status: 'NaoEmitir',
                    valor: parcela?.valor_parcela || 0,
                };
            });

            const { error } = await supabase
                .from('notas_fiscais')
                .upsert(upserts, { onConflict: 'parcela_id' });

            if (error) throw error;

            showSuccess(`${selectedParcelaIds.length} parcela(s) marcada(s) como 'Não Emitir'.`);
            setSelectedParcelaIds([]);
            refetch();
        } catch (error: any) {
            showError("Falha ao atualizar status: " + error.message);
        }
    };

    if (carregandoSessao || carregando || loadingConfig) {
        return (
            <LayoutPrincipal>
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </LayoutPrincipal>
        );
    }

    if (!canAccessPage || !ownerId) {
        return (
            <LayoutPrincipal>
                <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a emissão de notas fiscais.</p></CardContent></Card>
            </LayoutPrincipal>
        );
    }
    
    const isWebhookConfigured = !!configNF?.webhook_n8n_url;

    return (
        <LayoutPrincipal>
            <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
                <Receipt className="w-6 h-6 mr-2" /> Emissão de Notas Fiscais
            </h1>

            <Card className="mb-6">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros e Resumo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative w-full">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por cliente, descrição ou ID..."
                                value={filtroTexto}
                                onChange={(e) => setFiltroTexto(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        
                        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Filtrar Status NF" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pendente">Pendente Emissão</SelectItem>
                                <SelectItem value="emitida">Nota Emitida</SelectItem>
                                <SelectItem value="enviada">Enviada ao Cliente</SelectItem>
                                <SelectItem value="nao-emitidas">Não Emitidas (Dinheiro/Bens)</SelectItem>
                                <SelectItem value="nao-emitir">Não Emitir (Marcado)</SelectItem>
                                <SelectItem value="todos">Todos os Status</SelectItem>
                            </SelectContent>
                        </Select>
                        
                        <DateRangePicker date={filtroPeriodo} setDate={setFiltroPeriodo} />
                    </div>
                    
                    <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded-md border-l-4 border-yellow-500">
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                            Total Pendente de NF (Filtro Atual)
                        </p>
                        <p className="text-2xl font-bold mt-1">
                            {formatCurrency(totalPendente)}
                        </p>
                    </div>
                </CardContent>
            </Card>
            
            {!isWebhookConfigured && (
                <Alert variant="destructive" className="mb-6">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Configuração de Webhook Pendente</AlertTitle>
                    <AlertDescription className="flex items-center justify-between">
                        <span>Configure a URL do Webhook N8N para automatizar o envio da NF.</span>
                        <Link to="/configuracao-nf">
                            <Button variant="secondary" size="sm" className="ml-4">
                                Configurar Agora
                            </Button>
                        </Link>
                    </AlertDescription>
                </Alert>
            )}

            {selectedParcelaIds.length > 0 && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="text-lg">Ações em Lote</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={selectedParcelaIds.length === 0}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Marcar como 'Não Emitir' ({selectedParcelaIds.length})
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar Ação</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Tem certeza que deseja marcar {selectedParcelaIds.length} parcela(s) como "Não Emitir"? Esta ação pode ser revertida editando a nota fiscal individualmente.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleMarkAsNaoEmitir}>Confirmar</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-xl">Parcelas Pagas ({parcelasParaNF.length})</CardTitle>
                    <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as 'card' | 'list')} className="h-8">
                        <ToggleGroupItem value="card" aria-label="Visualização Card">
                            <LayoutGrid className="h-4 w-4" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="list" aria-label="Visualização Lista">
                            <List className="h-4 w-4" />
                        </ToggleGroupItem>
                    </ToggleGroup>
                </CardHeader>
                <CardContent>
                    {parcelasParaNF.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                            Nenhuma parcela paga encontrada com os filtros aplicados.
                        </p>
                    ) : viewMode === 'card' ? (
                        <div className="space-y-6">
                            {parcelasParaNF.map(parcela => (
                                <NotaFiscalCard
                                    key={parcela.id}
                                    parcela={parcela}
                                    notaFiscal={notasFiscais[parcela.id]}
                                    configNF={configNF}
                                    onUpdate={refetch}
                                    handleUploadNF={handleUploadNF}
                                    handleSendNF={handleSendNF}
                                    isSelected={selectedParcelaIds.includes(parcela.id)}
                                    onToggleSelect={handleToggleSelect}
                                />
                            ))}
                        </div>
                    ) : (
                        <NotaFiscalListView
                            parcelasParaNF={parcelasParaNF}
                            notasFiscais={notasFiscais}
                            configNF={configNF}
                            carregando={carregando}
                            handleUploadNF={handleUploadNF}
                            handleSendNF={handleSendNF}
                            onUpdate={refetch}
                            selectedIds={selectedParcelaIds}
                            onToggleSelect={handleToggleSelect}
                            onSelectAll={handleSelectAll}
                        />
                    )}
                </CardContent>
            </Card>
        </LayoutPrincipal>
    );
};

export default EmissaoNotas;