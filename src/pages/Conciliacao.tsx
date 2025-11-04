import LayoutPrincipal from '@/components/LayoutPrincipal';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Upload, Banknote, CheckCircle2, XCircle, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ConfiguracaoConciliacao, ExtratoRow } from '@/types/conciliacao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import Papa from 'papaparse';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge'; 

// Tipo que inclui o nome da conta de saldo para exibição
interface ConfiguracaoComConta extends ConfiguracaoConciliacao {
    saldo_contas: {
        nome: string;
    } | null;
}

const Conciliacao = () => {
  const { perfil, role, usuario, carregando: carregandoSessao } = useSessao();
  const [configsConciliacao, setConfigsConciliacao] = useState<ConfiguracaoComConta[]>([]);
  const [carregandoConfigs, setCarregandoConfigs] = useState(true);
  
  const [configSelecionadaId, setConfigSelecionadaId] = useState<string>('');
  const [extratoFile, setExtratoFile] = useState<File | null>(null);
  const [extratoData, setExtratoData] = useState<ExtratoRow[]>([]);
  const [processando, setProcessando] = useState(false);

  const getProprietarioId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const proprietarioId = getProprietarioId();
  const configSelecionada = useMemo(() => configsConciliacao.find(c => c.id === configSelecionadaId), [configsConciliacao, configSelecionadaId]);
  const contaSaldoAssociada = configSelecionada?.saldo_contas?.nome || 'N/A';

  const buscarDadosIniciais = useCallback(async () => {
    if (!proprietarioId) {
        setCarregandoConfigs(false);
        return;
    }
    
    setCarregandoConfigs(true);
    
    // Buscar configurações de conciliação, incluindo o nome da conta de saldo
    const { data: configsRes, error: configsError } = await supabase
        .from('configuracao_conciliacao')
        .select('*, saldo_contas ( nome )')
        .eq('proprietario_id', proprietarioId)
        .order('nome_configuracao');

    if (configsError) showError('Erro ao carregar configurações de conciliação: ' + configsError.message);
    else setConfigsConciliacao(configsRes as ConfiguracaoComConta[]);
    
    setCarregandoConfigs(false);
  }, [proprietarioId]);

  useEffect(() => {
    if (!carregandoSessao && proprietarioId) {
      buscarDadosIniciais();
    }
  }, [carregandoSessao, proprietarioId, buscarDadosIniciais]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setExtratoFile(event.target.files[0]);
      setExtratoData([]); // Limpa dados anteriores
    } else {
      setExtratoFile(null);
    }
  };
  
  const parseExtrato = async () => {
    if (!extratoFile || !configSelecionada) {
        showError('Selecione uma configuração de conciliação e o arquivo de extrato.');
        return;
    }
    
    setProcessando(true);
    setExtratoData([]);

    try {
        const results = await new Promise<Papa.ParseResult<any>>((resolve, reject) => {
            Papa.parse(extratoFile, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false,
                complete: resolve,
                error: reject,
            });
        });

        if (results.errors.length > 0) {
            throw new Error('Erro ao processar CSV: ' + results.errors[0].message);
        }
        
        const { mapeamento, coluna_tipo_transacao, valor_credito } = configSelecionada;
        const rows: ExtratoRow[] = [];
        
        results.data.forEach((row: any, index: number) => {
            // 1. Mapeamento Básico
            const dataStr = row[mapeamento['Data']];
            const valorStr = row[mapeamento['Valor']];
            const descricao = row[mapeamento['Descrição']];
            const identificacao = row[mapeamento['Identificação']];
            
            if (!dataStr || !valorStr) return; // Ignora linhas sem data ou valor

            // 2. Limpeza e Conversão de Valor
            let valorNumerico = parseFloat(valorStr.replace(/[R$\.]/g, '').replace(',', '.').trim());
            if (isNaN(valorNumerico)) return;
            
            // 3. Determinação do Tipo (Entrada/Saída)
            let tipo: 'Entrada' | 'Saida';
            
            if (coluna_tipo_transacao && valor_credito) {
                // Usa coluna de tipo (Ex: 'CRÉDITO' ou 'DÉBITO')
                const tipoOriginal = row[coluna_tipo_transacao]?.toUpperCase();
                tipo = tipoOriginal === valor_credito.toUpperCase() ? 'Entrada' : 'Saida';
            } else {
                // Usa o sinal do valor (Padrão: Positivo = Entrada, Negativo = Saída)
                tipo = valorNumerico >= 0 ? 'Entrada' : 'Saida';
                valorNumerico = Math.abs(valorNumerico); // Normaliza o valor para positivo
            }
            
            rows.push({
                id: `extrato-${index}`,
                data_movimentacao: dataStr,
                descricao: descricao || 'N/A',
                valor: valorNumerico,
                tipo: tipo,
                identificacao_original: identificacao || 'N/A',
                conciliado: false,
            });
        });
        
        setExtratoData(rows);
        showSuccess(`Extrato processado com ${rows.length} linhas para a conta ${contaSaldoAssociada}.`);

    } catch (error: any) {
        console.error('Erro ao processar extrato:', error);
        showError(error.message || 'Falha ao processar o arquivo de extrato.');
    } finally {
        setProcessando(false);
    }
  };
  
  // --- Lógica de Conciliação (Placeholder) ---
  
  const handleConciliar = (_rowId: string) => {
      // TODO: Implementar a lógica de conciliação real
      showError('Funcionalidade de conciliação ainda não implementada.');
  };
  
  const handleLancarManualmente = (_row: ExtratoRow) => {
      // TODO: Implementar a lógica de lançamento manual
      showError('Funcionalidade de lançamento manual ainda não implementada.');
  };

  if (carregandoSessao || carregandoConfigs) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }
  
  if (!proprietarioId) {
      return <LayoutPrincipal><Card><CardContent className="p-6 text-red-500">Você não está vinculado a uma empresa para conciliar.</CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Filter className="w-6 h-6 mr-2" /> Conciliação Bancária
      </h1>
      
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-xl">1. Importar Extrato</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Seleção de Configuração */}
                <div className="space-y-2 col-span-1 md:col-span-2">
                    <label className="font-medium text-sm">Configuração de Conciliação (Banco/Formato)</label>
                    <Select value={configSelecionadaId} onValueChange={setConfigSelecionadaId} disabled={configsConciliacao.length === 0 || processando}>
                        <SelectTrigger>
                            <Banknote className="w-4 h-4 mr-2" />
                            <SelectValue placeholder="Selecione a Configuração de Extrato" />
                        </SelectTrigger>
                        <SelectContent>
                            {configsConciliacao.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.nome_configuracao} ({c.saldo_contas?.nome || 'Conta Inválida'})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {configsConciliacao.length === 0 && <p className="text-xs text-red-500">Cadastre um formato em Configurações &gt; Bancos.</p>}
                </div>
                
                {/* Conta de Saldo Associada (Display) */}
                <div className="space-y-2">
                    <label className="font-medium text-sm">Conta de Saldo Associada</label>
                    <Input 
                        value={contaSaldoAssociada} 
                        readOnly 
                        disabled 
                        className="bg-gray-100 dark:bg-gray-800"
                    />
                </div>
                
                {/* Upload e Processamento */}
                <div className="space-y-2 col-span-3">
                    <label className="font-medium text-sm">Arquivo de Extrato (.csv)</label>
                    <div className="flex space-x-2">
                        <Input 
                            type="file" 
                            accept=".csv" 
                            onChange={handleFileChange} 
                            className="flex-1"
                            disabled={processando}
                        />
                        <Button 
                            onClick={parseExtrato} 
                            disabled={!extratoFile || !configSelecionadaId || processando}
                            size="default"
                        >
                            {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            Processar Extrato
                        </Button>
                    </div>
                </div>
            </div>
        </CardContent>
      </Card>
      
      {/* 2. Dados do Extrato e Conciliação */}
      {extratoData.length > 0 && (
        <Card>
            <CardHeader><CardTitle className="text-xl">2. Extrato Importado ({extratoData.length} linhas)</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">Data</TableHead>
                                <TableHead className="w-[100px] text-center">Tipo</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Identificação</TableHead>
                                <TableHead className="w-[120px] text-right">Valor</TableHead>
                                <TableHead className="w-[150px] text-center">Status</TableHead>
                                <TableHead className="w-[150px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {extratoData.map(row => (
                                <TableRow key={row.id} className={cn(row.conciliado && 'bg-green-500/10')}>
                                    <TableCell>{row.data_movimentacao}</TableCell>
                                    <TableCell className={cn("font-semibold text-center", row.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>
                                        {row.tipo}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{row.descricao}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{row.identificacao_original}</TableCell>
                                    <TableCell className="text-right font-semibold">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {row.conciliado ? (
                                            <Badge variant="success" className="flex items-center justify-center"><CheckCircle2 className="w-3 h-3 mr-1" /> Conciliado</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="flex items-center justify-center"><XCircle className="w-3 h-3 mr-1" /> Pendente</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end space-x-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => handleConciliar(row.id)}
                                                disabled={row.conciliado}
                                            >
                                                Conciliar
                                            </Button>
                                            <Button 
                                                variant="secondary" 
                                                size="sm" 
                                                onClick={() => handleLancarManualmente(row)}
                                                disabled={row.conciliado}
                                            >
                                                Lançar
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
      )}
    </LayoutPrincipal>
  );
};

export default Conciliacao;