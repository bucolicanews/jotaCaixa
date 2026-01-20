import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Printer, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ReciboRecebimentoPrint from './ReciboRecebimentoPrint';
import { useSessao } from '@/hooks/use-sessao';
import { useOwnerBranding } from '@/hooks/use-owner-branding';

interface ReciboRecebimentoDialogProps {
    parcelaId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface ReciboData {
    parcelaId: string;
    numeroParcela: number;
    valorTotal: number;
    valorRecebido: number;
    dataPagamento: string;
    formaPagamento: string;
    descricaoConta: string;
    clienteNome: string;
    clienteDocumento: string;
    ownerName: string;
    ownerDocumento: string;
    logoUrl: string | null;
}

const ReciboRecebimentoDialog: React.FC<ReciboRecebimentoDialogProps> = ({ parcelaId, open, onOpenChange }) => {
    const { ownerId, role } = useSessao();
    const { logoUrl, ownerName } = useOwnerBranding();
    const { printContent } = usePrint();
    
    const [reciboData, setReciboData] = useState<ReciboData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchReciboData = useCallback(async () => {
        if (!parcelaId || !ownerId) return;
        setLoading(true);

        const isOwnerAdmin = role === 'Admin' || role === 'Usuario';
        const tabelaParcelas = isOwnerAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
        const tabelaRecebimentos = isOwnerAdmin ? 'admin_recebimentos' : 'recebimentos';
        const tabelaContasReceber = isOwnerAdmin ? 'admin_contas_receber' : 'contas_receber';
        const tabelaClientes = isOwnerAdmin ? 'tbl_clientes' : 'clientes';
        
        try {
            // 1. Buscar Parcela e Recebimento
            const { data: recebimento, error: recebimentoError } = await supabase
                .from(tabelaRecebimentos)
                .select(`
                    valor_recebido, data_recebimento, forma_pagamento,
                    parcela: ${tabelaParcelas} (
                        numero_parcela, valor_parcela, conta_receber_id
                    )
                `)
                .eq('parcela_id', parcelaId)
                .order('data_recebimento', { ascending: false })
                .limit(1)
                .single();

            if (recebimentoError || !recebimento) throw new Error('Recebimento não encontrado para esta parcela.');
            
            const parcelaInfo = recebimento.parcela;
            if (!parcelaInfo) throw new Error('Dados da parcela não encontrados.');

            // 2. Buscar Conta Sintética e Cliente
            const { data: contaSintetica, error: contaError } = await supabase
                .from(tabelaContasReceber)
                .select(`
                    descricao, cliente_id,
                    cliente: ${tabelaClientes} ( nome, documento, cpf, cnpj )
                `)
                .eq('id', parcelaInfo.conta_receber_id)
                .single();

            if (contaError || !contaSintetica) throw new Error('Conta ou Cliente não encontrados.');
            
            const clienteData = contaSintetica.cliente;
            const clienteDocumento = clienteData?.documento || clienteData?.cpf || clienteData?.cnpj || 'N/A';
            
            // 3. Buscar dados do Admin/Empresa (para o recibo)
            const { data: ownerData } = await supabase
                .from(isOwnerAdmin ? 'tbl_admins' : 'tbl_clientes')
                .select('nome, cnpj, cpf, documento')
                .eq('id', ownerId)
                .single();
                
            const ownerDocumento = ownerData?.documento || ownerData?.cnpj || ownerData?.cpf || 'N/A';

            setReciboData({
                parcelaId: parcelaId,
                numeroParcela: parcelaInfo.numero_parcela,
                valorTotal: parcelaInfo.valor_parcela,
                valorRecebido: recebimento.valor_recebido,
                dataPagamento: recebimento.data_recebimento,
                formaPagamento: recebimento.forma_pagamento,
                descricaoConta: contaSintetica.descricao,
                clienteNome: clienteData?.nome || 'N/A',
                clienteDocumento: clienteDocumento,
                ownerName: ownerName || ownerData?.nome || 'Empresa',
                ownerDocumento: ownerDocumento,
                logoUrl: logoUrl,
            });

        } catch (error: any) {
            console.error('Erro ao buscar dados do recibo:', error);
            showError('Falha ao carregar dados do recibo: ' + error.message);
            setReciboData(null);
        } finally {
            setLoading(false);
        }
    }, [parcelaId, ownerId, role, logoUrl, ownerName]);

    useEffect(() => {
        if (open && parcelaId) {
            fetchReciboData();
        } else if (!open) {
            setReciboData(null);
        }
    }, [open, parcelaId, fetchReciboData]);

    const handlePrint = () => {
        if (!reciboData) return;
        
        const printComponent = <ReciboRecebimentoPrint data={reciboData} />;
        const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
        
        printContent(htmlContent, `Recibo - ${reciboData.clienteNome} - ${reciboData.parcelaId.substring(0, 8)}`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[95vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center">
                        <FileText className="w-5 h-5 mr-2" /> Recibo de Recebimento
                    </DialogTitle>
                    <DialogDescription>
                        {reciboData ? `Comprovante de pagamento para ${reciboData.clienteNome}` : 'Carregando dados...'}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : reciboData ? (
                    <>
                        <div className="border rounded-md p-4 bg-white text-zinc-900 shadow-inner overflow-y-auto flex-1">
                            <ReciboRecebimentoPrint data={reciboData} />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                            <Button onClick={handlePrint}>
                                <Printer className="w-4 h-4 mr-2" /> Imprimir Recibo
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <div className="text-center text-red-500 p-8">
                        Não foi possível gerar o recibo. Verifique se a parcela foi totalmente paga.
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default ReciboRecebimentoDialog;