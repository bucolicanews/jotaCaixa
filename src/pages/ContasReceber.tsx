import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Edit, Trash2, ListChecks, BadgeDollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber, ParcelaDetalhada } from '@/types/contas-receber';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContasReceber from '@/components/FormContasReceber';
import DetalhesParcelasDialog from '@/components/DetalhesParcelasDialog';
import { Badge } from '@/components/ui/badge';
import { DateRange } from 'react-day-picker';
import { isToday, isPast, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { useSearchParams } from 'react-router-dom';
import RegistrarPagamentoDialog from '@/components/RegistrarPagamentoDialog';
import ContasReceberAcoes from '@/components/ContasReceberAcoes';

type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

const getBadgeVariant = (status: ParcelaStatus, dataVencimento: string): BadgeVariant => {
// ... (função getBadgeVariant inalterada)
};

// Tipo para o histórico de recebimentos (Admin)
interface AdminRecebimento {
    id: string;
    data_recebimento: string;
    valor_recebido: number;
    forma_pagamento: string;
    cliente_id: string;
    admin_parcelas_receber: {
        numero_parcela: number;
        admin_contas_receber: {
            descricao: string;
            origem: ContaReceber['origem']; // Adicionando origem aqui
        } | null;
    } | null;
}

// NOVO: Tipo para a parcela detalhada com data_pagamento (para resolver TS2339)
interface ExtendedParcelaDetalhada extends ParcelaDetalhada {
    data_pagamento?: string | null;
}

// Novo tipo para a conta sintética com progresso
interface ContaReceberComProgresso extends ContaReceber {
    parcelas_pagas?: number;
    parcelas_total?: number;
}

const ContasReceber = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [searchParams] = useSearchParams(); // Hook para ler a URL
  
  const [contas, setContas] = useState<ContaReceberComProgresso[]>([]);
  const [parcelas, setParcelas] = useState<ExtendedParcelaDetalhada[]>([]); // USANDO TIPO ESTENDIDO
  const [recebimentos, setRecebimentos] = useState<AdminRecebimento[]>([]); // Novo estado para recebimentos
// ... (restante do estado inalterado)

// ... (funções fetchClienteNames e buscarDados inalteradas, exceto pelo cast em buscarDados)

    if (contasRes.error) showError('Erro ao carregar contas: ' + contasRes.error.message);
    else {
        let fetchedContas = contasRes.data as ContaReceberComProgresso[];
        let fetchedParcelas = parcelasRes.data as ExtendedParcelaDetalhada[]; // CAST PARA TIPO ESTENDIDO
        
        // --- Lógica para calcular progresso de pagamento ---
// ... (lógica de progresso inalterada)
        
        setContas(fetchedContas);
        setParcelas(fetchedParcelas);
    }

// ... (restante de buscarDados inalterado)

// ... (funções handleSaveComplete, handlePagamentoCompleto, handleDelete, handleOpenParcelas inalteradas)
  
  const handleOpenPagamento = (parcela: any) => {
    // Mapeia os campos necessários para o RegistrarPagamentoDialog
    const isMyLaunch = isAdmin;
    
    const contaReceber = isMyLaunch 
        ? (parcela as any).admin_contas_receber 
        : (parcela as any).contas_receber;
        
    // NOVO: Obtém o cliente_id real (ID da tbl_clientes)
    let clienteIdReal: string | undefined;
    
    if (isMyLaunch) {
        // Se for Admin, o cliente_id real está em admin_contas_receber.cliente_id
        // CORREÇÃO: Garantir que acessamos o objeto, mesmo que Supabase retorne um array de 1 item
        const contaData = Array.isArray(contaReceber) ? contaReceber[0] : contaReceber;
        clienteIdReal = contaData?.cliente_id;
    } else {
        // Se for Cliente, o cliente_id real é o ID do cliente de CR (clientes.id)
        clienteIdReal = contaReceber?.clientes?.id;
    }
        
    const mappedParcela = {
        id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        empresa_id: isMyLaunch ? contaReceber.admin_id : contaReceber.empresa_id,
        valor_parcela: parcela.valor_parcela,
        valor_pago: parcela.valor_pago,
        cliente_id_real: clienteIdReal, // Passa o ID do cliente real
    };
    
    setParcelaParaPagamento(mappedParcela);
    setPagamentoDialogOpen(true);
  };

// ... (restante do arquivo inalterado, pois o uso de p.data_pagamento agora é válido)