import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Search, Hash, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface IdentificacaoExtrato {
    id: string;
    descricao: string;
    status: boolean;
    ordem: number;
    created_at: string;
}

interface FormIdentificacaoProps {
    identificacaoInicial?: IdentificacaoExtrato | null;
    proprietarioId: string;
    isAdmin: boolean;
    onSaveComplete: () => void;
    proximaOrdem: number;
}

const FormIdentificacao: React.FC<FormIdentificacaoProps> = ({ identificacaoInicial, proprietarioId, isAdmin, onSaveComplete, proximaOrdem }) => {
    const [descricao, setDescricao] = useState(identificacaoInicial?.descricao || '');
    const [status, setStatus] = useState(identificacaoInicial?.status ?? true);
    const [ordem, setOrdem] = useState(identificacaoInicial?.ordem ?? proximaOrdem);
    const [loading, setLoading] = useState(false);
    const isEditing = !!identificacaoInicial;

    const tabela = isAdmin ? 'admin_identificacao_extrato' : 'identificacao_extrato';
    const campoId = isAdmin ? 'admin_id' : 'empresa_id';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!descricao.trim()) {
            showError('A identificação é obrigatória.');
            return;
        }
        setLoading(true);

        const dataToSave = {
            descricao: descricao.trim(),
            status,
            ordem,
            [campoId]: proprietarioId,
        };

        let error = null;

        if (isEditing) {
            const result = await supabase.from(tabela).update(dataToSave).eq('id', identificacaoInicial.id);
            error = result.error;
        } else {
            const result = await supabase.from(tabela).insert(dataToSave);
            error = result.error;
        }

        if (error) {
            showError(`Falha ao salvar: ${error.message}`);
        } else {
            showSuccess(`Identificador salvo com sucesso!`);
            onSaveComplete();
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="descricao">Identificador</Label>
                <Input
                    id="descricao"
                    placeholder="Ex: PIX, TED, DOC, Boleto, Cheque"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    disabled={loading}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="ordem">Ordem</Label>
                    <Input
                        id="ordem"
                        type="number"
                        min={0}
                        value={ordem}
                        onChange={(e) => setOrdem(parseInt(e.target.value) || 0)}
                        disabled={loading}
                    />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                    <Switch
                        id="status"
                        checked={status}
                        onCheckedChange={setStatus}
                        disabled={loading}
                    />
                    <Label htmlFor="status">Ativo</Label>
                </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Salvar Alterações' : 'Criar Identificador')}
            </Button>
        </form>
    );
};

const GerenciarIdentificadoresExtrato: React.FC = () => {
    const { perfil, role, carregando: carregandoSessao } = useSessao();
    
    const [identificadores, setIdentificadores] = useState<IdentificacaoExtrato[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [dialogAberto, setDialogAberto] = useState(false);
    const [identificadorSelecionado, setIdentificadorSelecionado] = useState<IdentificacaoExtrato | null>(null);
    const [filtroTexto, setFiltroTexto] = useState('');
    const filtroTextoDebounced = useDebounce(filtroTexto, 500);
    
    const isAdmin = role === 'Admin';
    const tabela = isAdmin ? 'admin_identificacao_extrato' : 'identificacao_extrato';
    const campoId = isAdmin ? 'admin_id' : 'empresa_id';

    const getOwnerId = () => {
        if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
        if (role === 'Usuario') {
            const user = perfil as any;
            if (user?.admin_id) return user.admin_id;
            if (user?.cliente_id) return user.cliente_id;
        }
        return null;
    };
    
    const ownerId = getOwnerId();

    const buscarIdentificadores = useCallback(async () => {
        if (!ownerId) {
            setCarregando(false);
            return;
        }
        setCarregando(true);
        
        let query = supabase
            .from(tabela)
            .select('*')
            .eq(campoId, ownerId)
            .order('ordem', { ascending: true });
            
        if (filtroTextoDebounced) {
            query = query.ilike('descricao', `%${filtroTextoDebounced}%`);
        }

        const { data, error } = await query;

        if (error) {
            showError('Erro ao carregar identificadores: ' + error.message);
            setIdentificadores([]);
        } else {
            setIdentificadores(data || []);
        }
        setCarregando(false);
    }, [ownerId, filtroTextoDebounced, tabela, campoId]);

    useEffect(() => {
        if (!carregandoSessao && ownerId) {
            buscarIdentificadores();
        }
    }, [carregandoSessao, ownerId, buscarIdentificadores]);

    const handleDelete = async (id: string) => {
        const { error } = await supabase.from(tabela).delete().eq('id', id);
        if (error) {
            showError('Falha ao excluir: ' + error.message);
        } else {
            showSuccess('Identificador excluído com sucesso!');
            buscarIdentificadores();
        }
    };
    
    const handleToggleStatus = async (item: IdentificacaoExtrato) => {
        const { error } = await supabase
            .from(tabela)
            .update({ status: !item.status })
            .eq('id', item.id);
            
        if (error) {
            showError('Falha ao atualizar status: ' + error.message);
        } else {
            buscarIdentificadores();
        }
    };
    
    const handleMoveOrder = async (item: IdentificacaoExtrato, direction: 'up' | 'down') => {
        const currentIndex = identificadores.findIndex(d => d.id === item.id);
        if (currentIndex === -1) return;
        
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= identificadores.length) return;
        
        const targetItem = identificadores[targetIndex];
        
        const updates = [
            supabase.from(tabela).update({ ordem: targetItem.ordem }).eq('id', item.id),
            supabase.from(tabela).update({ ordem: item.ordem }).eq('id', targetItem.id),
        ];
        
        const results = await Promise.all(updates);
        const hasError = results.some(r => r.error);
        
        if (hasError) {
            showError('Falha ao reordenar.');
        } else {
            buscarIdentificadores();
        }
    };

    const handleOpenDialog = (identificador?: IdentificacaoExtrato) => {
        setIdentificadorSelecionado(identificador || null);
        setDialogAberto(true);
    };

    const handleDialogClose = () => {
        setDialogAberto(false);
        setIdentificadorSelecionado(null);
        buscarIdentificadores();
    };
    
    const proximaOrdem = identificadores.length > 0 ? Math.max(...identificadores.map(d => d.ordem)) + 1 : 0;

    if (carregandoSessao) {
        return (
            <LayoutPrincipal>
                <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
            </LayoutPrincipal>
        );
    }

    return (
        <LayoutPrincipal>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Hash className="h-6 w-6" /> Identificadores de Extrato
                        </h1>
                        <p className="text-muted-foreground">Gerencie os identificadores padrão para o registro de extrato manual.</p>
                    </div>
                    <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
                        <DialogTrigger asChild>
                            <Button onClick={() => handleOpenDialog()}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Novo Identificador
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{identificadorSelecionado ? 'Editar Identificador' : 'Novo Identificador'}</DialogTitle>
                            </DialogHeader>
                            {ownerId && (
                                <FormIdentificacao
                                    identificacaoInicial={identificadorSelecionado}
                                    proprietarioId={ownerId}
                                    isAdmin={isAdmin}
                                    onSaveComplete={handleDialogClose}
                                    proximaOrdem={proximaOrdem}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar identificador..."
                                value={filtroTexto}
                                onChange={(e) => setFiltroTexto(e.target.value)}
                                className="max-w-sm"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        {carregando ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                        ) : identificadores.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">Nenhum identificador cadastrado.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[80px]">Ordem</TableHead>
                                        <TableHead>Identificador</TableHead>
                                        <TableHead className="w-[100px]">Status</TableHead>
                                        <TableHead className="w-[150px] text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {identificadores.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <span className="font-mono text-sm">{item.ordem}</span>
                                                    <div className="flex flex-col">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5"
                                                            disabled={index === 0}
                                                            onClick={() => handleMoveOrder(item, 'up')}
                                                        >
                                                            <ArrowUp className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5"
                                                            disabled={index === identificadores.length - 1}
                                                            onClick={() => handleMoveOrder(item, 'down')}
                                                        >
                                                            <ArrowDown className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{item.descricao}</TableCell>
                                            <TableCell>
                                                <Badge 
                                                    variant={item.status ? 'success' : 'secondary'}
                                                    className="cursor-pointer"
                                                    onClick={() => handleToggleStatus(item)}
                                                >
                                                    {item.status ? 'Ativo' : 'Inativo'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(item)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon">
                                                                <Trash2 className="h-4 w-4 text-destructive" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Deseja realmente excluir o identificador "{item.descricao}"? Esta ação não pode ser desfeita.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDelete(item.id)}>Excluir</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </LayoutPrincipal>
    );
};

export default GerenciarIdentificadoresExtrato;
