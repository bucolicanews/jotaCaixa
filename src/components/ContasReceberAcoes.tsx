import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, FileText, FileDown, Filter, Loader2 } from 'lucide-react';
import { ContaReceber, ParcelaDetalhada } from '@/types/contas-receber';
import { format, parseISO } from 'date-fns';
import Papa from 'papaparse';
import { showError, showSuccess } from '@/utils/toast';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ContasReceberPrint from './ContasReceberPrint';

// Definindo o tipo ContaReceberComProgresso localmente para resolver TS2339
interface ContaReceberComProgresso extends ContaReceber {
    parcelas_pagas?: number;
    parcelas_total?: number;
}

// NOVO: Tipo para a parcela detalhada com data_pagamento (para resolver TS2339)
interface ExtendedParcelaDetalhada extends ParcelaDetalhada {
    data_pagamento?: string | null;
}

interface ContasReceberAcoesProps {
  activeTab: string;
// ... (outras props inalteradas)
  
  // Dados filtrados para exportação/impressão
  contasFiltradas: ContaReceberComProgresso[]; // Usando o tipo corrigido
  parcelasFiltradas: ExtendedParcelaDetalhada[]; // USANDO TIPO ESTENDIDO
  recebimentosFiltrados: any[]; // Usamos any para simplificar o tipo AdminRecebimento
  clienteNomeMap: Record<string, string>;
  isAdmin: boolean;
}

// ... (funções formatDate e formatTimestamp inalteradas)

const ContasReceberAcoes: React.FC<ContasReceberAcoesProps> = ({
// ... (props desestruturadas inalteradas)
}) => {
// ... (restante do componente inalterado)