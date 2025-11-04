import React, { Dispatch, SetStateAction } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ParcelaParaPagamento } from '@/types/contas-receber';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Loader2, CreditCard } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

interface RegistrarPagamentoDialogProps {
    parcela: ParcelaParaPagamento | null;
    open: boolean;
    onOpenChange: Dispatch<SetStateAction<boolean>>;
    onSaveComplete: () => void;
}

const RegistrarPagamentoDialog: React.FC<RegistrarPagamentoDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
    const { role, perfil, usuario } = useSessao();
    const [loading, setLoading] = React.useState(false);
    const [valorRecebido, setValorRecebido] = React.useState<number>(0);
    const [formaPagamento, setFormaPagamento] = React.useState('Pix');
    const [contaDestinoId, setContaDestinoId] = React.useState<string | null>(null);
    const [contasSaldo, setContasSaldo] = React.useState<SaldoContaDetalhada[]>([]);
    
    const isMyLaunch = role === 'Admin';
    
    const getOwnerId = () => {
        if (role === 'Admin') return usuario?.id || null;
        if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
        if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
        return null;
    };
    
    const ownerId = getOwnerId();

    React.useEffect(() => {
        if (parcela) {
            setValorRecebido(parcela.valor_parcela - parcela.valor_pago);
        }
    }, [parcela]);
    
    const fetchContasSaldo = React.useCallback(async () => {
        if (!ownerId) return;
        
        const { data, error } = await supabase
            .from('saldo_contas')
            .select('*, plano_contas ( Conta, Descricao )')
            .eq('empresa_id', ownerId)
            .order('nome');
            
        if (error) {
            showError('Erro ao carregar contas de saldo: ' + error.message);
            setContasSaldo([]);
        } else {
            setContasSaldo(data as SaldoContaDetalhada[]);
            if (data.length > 0 && !contaDestinoId) {
                setContaDestinoId(data[0].id);
            }
        }
    }, [ownerId, contaDestinoId]);
    
    React.useEffect(() => {
        if (open) {
            fetchContasSaldo();
        }
    }, [open, fetchContasSaldo]);

    const handleRegistro = async () => {
        if (!parcela || !ownerId || !contaDestinoId) {
            showError('Dados incompletos para registro.');
            return;
        }
        if (valorRecebido <= 0) {
            showError('O valor recebido deve ser positivo.');
            return;
        }

        setLoading(true);
        
        const valorRestante = parcela.valor_parcela - parcela.valor_pago;
        const tipoRecebimento = valorRecebido >= valorRestante ? 'total' : 'parcial';
        const valorDesconto = valorRecebido < valorRestante ? valorRestante - valorRecebido : 0;
        
        try {
            // 1. Registrar o Recebimento (admin_recebimentos ou recebimentos)
            const tabelaRecebimentos = isMyLaunch ? 'admin_recebimentos' : 'recebimentos';
            const ownerKey = isMyLaunch ? 'admin_id' : 'empresa_id';
            
            const recebimentoPayload = {
                [ownerKey]: ownerId,
                parcela_id: parcela.id,
                valor_recebido: valorRecebido,
                tipo_recebimento: tipoRecebimento,
                desconto_aplicado: valorDesconto,
                forma_pagamento: formaPagamento,
                cliente_id: parcela.cliente_id, // ID do cliente que pagou (tbl_clientes)
                conta_id: contaDestinoId, // ID da conta de saldo (saldo_contas)
            };
            
            const { error: recebimentoError, data: recebimentoData } = await supabase
                .from(tabelaRecebimentos)
                .insert(recebimentoPayload)
                .select('id')
                .single();
            
            if (recebimentoError) throw recebimentoError;
            
            // 2. Atualizar a Parcela (status e valor_pago)
            const tabelaParcelas = isMyLaunch ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
            const novoValorPago = parcela.valor_pago + valorRecebido;
            const novoStatus = novoValorPago >= parcela.valor_parcela ? 'paga' : 'parcial';
            
            const { error: parcelaError } = await supabase
                .from(tabelaParcelas)
                .update({ 
                    valor_pago: novoValorPago, 
                    status: novoStatus,
                    data_pagamento: novoStatus === 'paga' ? new Date().toISOString().split('T')[0] : null,
                })
                .eq('id', parcela.id);
                
            if (parcelaError) throw parcelaError;
            
            // 3. Registrar Lançamento de Entrada na conta de saldo (tabela lancamentos)
            const lancamentoPayload = {
                empresa_id: ownerId,
                data_movimentacao: new Date().toISOString().split('T')[0],
                descricao: `Recebimento Parcela #${parcela.numero_parcela} - ${parcela.id}`,
                valor: valorRecebido,
                tipo: 'Entrada',
                conta_bancaria_id: contaDestinoId,
                // TODO: Adicionar conta_contabil_id (do plano de contas da parcela)
                conciliado: true, // Marca como conciliado automaticamente
                origem: 'recebimento_cr',
                documento: recebimentoData.id, // Referência ao ID do recebimento
            };
            
            const { error: lancamentoError } = await supabase
                .from('lancamentos')
                .insert(lancamentoPayload);
                
            if (lancamentoError) throw lancamentoError;

            showSuccess('Pagamento registrado com sucesso!');
            onOpenChange(false);
            onSaveComplete();

        } catch (error: any) {
            console.error('Erro ao registrar pagamento:', error);
            showError('Falha ao registrar pagamento: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!parcela) return null;
    
    const valorRestante = parcela.valor_parcela - parcela.valor_pago;
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Registrar Pagamento</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="p-3 bg-secondary rounded-md space-y-1">
                        <p className="text-sm font-medium">Parcela ID: <span className="font-mono text-xs">{parcela.id}</span></p>
                        <p className="text-sm font-medium">Valor Total: {formatCurrency(parcela.valor_parcela)}</p>
                        <p className="text-sm font-medium text-red-500">Valor Pendente: {formatCurrency(valorRestante)}</p>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="valor-recebido">Valor Recebido</Label>
                        <Input
                            id="valor-recebido"
                            type="number"
                            step="0.01"
                            value={valorRecebido}
                            onChange={(e) => setValorRecebido(Number(e.target.value))}
                            disabled={loading}
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="forma-pagamento">Forma de Pagamento</Label>
                        <Select value={formaPagamento} onValueChange={setFormaPagamento} disabled={loading}>
                            <SelectTrigger id="forma-pagamento">
                                <SelectValue placeholder="Selecione a forma" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Pix">Pix</SelectItem>
                                <SelectItem value="Boleto">Boleto</SelectItem>
                                <SelectItem value="Cartao">Cartão</SelectItem>
                                <SelectItem value="Transferencia">Transferência</SelectItem>
                                <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="conta-destino">Conta de Destino (Caixa/Banco)</Label>
                        <Select value={contaDestinoId || ''} onValueChange={setContaDestinoId} disabled={loading || contasSaldo.length === 0}>
                            <SelectTrigger id="conta-destino">
                                <SelectValue placeholder="Selecione a conta de saldo" />
                            </SelectTrigger>
                            <SelectContent>
                                {contasSaldo.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.nome} ({c.plano_contas?.Conta})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {contasSaldo.length === 0 && <p className="text-xs text-red-500">Nenhuma conta de saldo cadastrada.</p>}
                    </div>
                </div>

                <Button onClick={handleRegistro} className="w-full" disabled={loading || valorRecebido <= 0 || !contaDestinoId}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Confirmar Recebimento
                </Button>
            </DialogContent>
        </Dialog>
    );
};

export default RegistrarPagamentoDialog;