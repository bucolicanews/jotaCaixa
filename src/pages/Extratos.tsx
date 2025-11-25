import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Banknote, Filter, Search, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TransacaoExtrato } from '@/types/conciliacao';

interface ExtratoRecord {
    id: string;
    data: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    identificacao: string | null;
    conciliado: boolean;
    conta_contabil_id: string | null;
    id_saldo_contas: string;
    saldo_contas: { nome: string } | null;
}

const Extratos: React.FC = () => {
  const { usuario, carregando: carregandoSessao } = useSessao();
  const [extratos, setExtratos] = useState<ExtratoRecord[]>([]);
  const [carregandoExtratos, setCarregandoExtratos] = useState(true);
  
  // Filtros
  const [filtroContaId, setFiltroContaId] = useState('todos');
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [contasDisponiveis, setContasDisponiveis] = useState<{ id: string, nome: string }[]>([]);

  const ownerId = usuario?.id;

  const fetchContas = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase.from('saldo_contas').select('id, nome').eq('proprietario_id', ownerId);
    if (error) console.error('Erro ao carregar contas:', error);
    else setContasDisponiveis(data || []);
  }, [ownerId]);

  const fetchExtratos = useCallback(async () => {
    if (!ownerId) return;
    setCarregandoExtratos(true);
    
    let query = supabase
      .from('extratos')
      .select(`
        *,
        saldo_contas:id_saldo_contas ( nome )
      `)
      .eq('empresa_id', ownerId)
      .order('data', { ascending: false });
      
    if (filtroContaId !== 'todos') {
        query = query.eq('id_saldo_contas', filtroContaId);
    }
    
    if (filtroTextoDebounced) {
        const termo = `%${filtroTextoDebounced}%`;
        query = query.or(`descricao.ilike.${termo},identificacao.ilike.${termo}`);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar extratos: ' + error.message);
      setExtratos([]);
    } else {
      setExtratos(data as ExtratoRecord[]);
    }
    setCarregandoExtratos(false);
  }, [ownerId, filtroContaId, filtroTextoDebounced]);

  useEffect(() => {
    if (!carregandoSessao && ownerId) {
      fetchContas();
      fetchExtratos();
    }
  }, [carregandoSessao, ownerId, fetchContas, fetchExtratos]);

  if (carregandoSessao || carregandoExtratos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId) {
    return <LayoutPrincipal><Card><CardContent className="p-6">Você não está vinculado a uma empresa para ver extratos.</CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Banknote className="w-6 h-6 mr-2" /> Extratos Bancários Salvos
      </h1>
      
      <Card className="mb-6">
        <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle></CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4">
            <div className="relative w-full md:w-[300px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por descrição ou identificação..."
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    className="pl-10"
                />
            </div>
            
            <Select value={filtroContaId} onValueChange={setFiltroContaId}>
                <SelectTrigger className="w-full md:w-[250px]">
                    <SelectValue placeholder="Filtrar por Conta/Caixa" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todas as Contas</SelectItem>
                    {contasDisponiveis.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Transações Salvas ({extratos.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Data</TableHead>
                  <TableHead className="w-[150px]">Conta/Caixa</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[100px]">Identificação</TableHead>
                  <TableHead className="w-[80px] text-center">Tipo</TableHead>
                  <TableHead className="w-[120px] text-right">Valor</TableHead>
                  <TableHead className="w-[150px]">Conta Contábil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extratos.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">Nenhum extrato salvo.</TableCell></TableRow>
                ) : (
                  extratos.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{formatarData(e.data)}</TableCell>
                      <TableCell className="font-medium text-sm">{e.saldo_contas?.nome || 'N/A'}</TableCell>
                      <TableCell className="text-sm">{e.descricao}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.identificacao || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={e.tipo === 'Entrada' ? 'success' : 'destructive'}>
                          {e.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold", e.valor >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {formatCurrency(Math.abs(e.valor))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.conta_contabil_id || 'N/A'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default Extratos;