import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag } from '@/types/contratos';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cliente } from '@/types/cliente';
import { format, parseISO, setDate, addMonths, addDays } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const navigate = useNavigate();
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [tags, setTags] = useState<ContratoTag[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Campos obrigatórios para o contrato
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number | ''>('');
  
  // Campos de Forma de Pagamento
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(undefined);
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(undefined);
  const [intervaloDias, setIntervaloDias] = useState<number>(30); // Usado para Repetir/Parcelar

  const isCliente = role === 'Cliente';
  const isAdmin = role === 'Admin';
  const empresaId = isCliente ? (perfil as ClienteProfile)?.id : (role === 'Usuario' ? (perfil as UsuarioProfile)?.cliente_id : null);

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };

  const buscarDados = useCallback(async () => {
    if (!modeloId || !empresaId) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    // 1. Buscar Modelo
    const { data: modeloData, error: modeloError } = await supabase
        .from('contrato_modelos')
        .select('*')
        .eq('id', modeloId)
        .single();
        
    if (modeloError) {
        showError('Modelo não encontrado ou acesso negado.');
        navigate('/contratos', { replace: true });
        return;
    }
    setModelo(modeloData as ContratoModelo);
    
    // 2. Buscar Tags (apenas as da empresa ou globais)
    const { data: tagsData, error: tagsError } = await supabase
        .from('contrato_tags')
        .select('*')
        .or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
        .order('nome_tag');
        
    if (tagsError) {
        showError('Erro ao carregar tags: ' + tagsError.message);
        setTags([]);
    } else {
        setTags(tagsData as ContratoTag[]);
    }
    
    // 3. Buscar Clientes
    const ownerId = getOwnerId();
    if (ownerId) {
        const { data: clientesData, error: clientesError } = await supabase
            .from('clientes')
            .select('*')
            .eq('empresa_id', ownerId)
            .order('nome');
            
        if (clientesError) {
            showError('Erro ao carregar clientes: ' + clientesError.message);
            setClientes([]);
        } else {
            setClientes(clientesData as Cliente[]);
        }
    }

    setCarregandoDados(false);
  }, [modeloId, empresaId, navigate, role, perfil]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || isCliente || (role === 'Usuario' && empresaId))) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isCliente) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, isAdmin, isCliente, role, empresaId, buscarDados, navigate]);
  
  const handleTagChange = (tag: string, value: string) => {
    setValoresTags(prev => ({ ...prev, [tag]: value }));
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let conteudoRenderizado = template;
    for (const tag in tags) {
        // Substitui a tag {{nome_tag}} pelo valor preenchido
        const regex = new RegExp(tag, 'g');
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[tag]);
    }
    return conteudoRenderizado;
  };

  const gerarParcelas = (
    valorTotal: number, 
    tipoLancamento: TipoLancamento,
    numParcelas: number, 
    dataVencimentoUnico: Date | undefined,
    dataPrimeiroVencimento: Date | undefined,
    intervaloDias: number,
  ) => {
    const parcelas = [];
    
    if (tipoLancamento === 'unico' && dataVencimentoUnico) {
        parcelas.push({ 
            numero_parcela: 1, 
            valor_parcela: valorTotal, 
            data_vencimento: format(dataVencimentoUnico, 'yyyy-MM-dd'), 
            status: 'aberta' 
        });
    } else if (tipoLancamento !== 'unico' && dataPrimeiroVencimento && numParcelas >= 1 && intervaloDias >= 1) {
        const valorParcela = tipoLancamento === 'parcelar' ? (valorTotal / numParcelas) : valorTotal;
        
        for (let i = 0; i < numParcelas; i++) {
            const dataVencimento = addDays(dataPrimeiroVencimento, i * intervaloDias);
            
            parcelas.push({
                numero_parcela: i + 1,
                valor_parcela: valorParcela,
                data_vencimento: format(dataVencimento, 'yyyy-MM-dd'),
                status: 'aberta',
            });
        }
    }
    return parcelas;
  };

  const handleSalvarContrato = async () => {
    const valorNumerico = Number(valorTotal);
    const numParcelas = Number(numeroParcelas);
    
    // 1. Validação
    if (!modelo || !clienteSelecionadoId || valorTotal === '' || !empresaId || valorNumerico <= 0) {
        showError('Preencha Cliente e Valor Total.');
        return;
    }
    
    if (tipoLancamento === 'unico' && !dataVencimentoUnico) {
        showError('Selecione a Data de Vencimento para o lançamento único.');
        return;
    }
    
    if (tipoLancamento !== 'unico') {
        if (numParcelas < 1) {
            showError('O número de parcelas deve ser pelo menos 1.');
            return;
        }
        if (!dataPrimeiroVencimento) {
            showError('Selecione a Data do Primeiro Vencimento.');
            return;
        }
        if (intervaloDias < 1) {
            showError('O intervalo de dias deve ser pelo menos 1.');
            return;
        }
    }
    
    setIsSubmitting(true);
    
    try {
        // 2. Gerar Parcelas
        const parcelasParaInserir = gerarParcelas(
            valorNumerico, 
            tipoLancamento, 
            numParcelas, 
            dataVencimentoUnico, 
            dataPrimeiroVencimento, 
            intervaloDias
        );
        
        if (parcelasParaInserir.length === 0) {
            throw new Error('Falha ao gerar parcelas. Verifique os dados de pagamento.');
        }
        
        // O valor total do contrato é o valor total inserido, exceto se for 'repetir', onde é Valor * Nº Parcelas
        const valorFinalContrato = tipoLancamento === 'repetir' ? valorNumerico * numParcelas : valorNumerico;
        
        // 3. Renderizar o conteúdo final
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
        
        // 4. Inserir o Contrato Gerado
        const contratoData = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId,
            empresa_id: empresaId,
            status: 'rascunho',
            valor_total: valorFinalContrato,
            data_inicio: format(new Date(), 'yyyy-MM-dd'), // Data de criação do contrato
            numero_parcelas: numParcelas,
            dia_vencimento_parcela: tipoLancamento === 'unico' ? null : intervaloDias, // Usando intervaloDias aqui para simplificar o campo
            valores_tags_preenchidos: valoresTags,
            conteudo_renderizado: conteudoRenderizado,
        };
        
        const { data: contratoGerado, error: contratoError } = await supabase
            .from('contratos_gerados')
            .insert(contratoData)
            .select('id')
            .single();
            
        if (contratoError) throw contratoError;
        
        const contratoGeradoId = contratoGerado.id;
        
        // 5. Inserir a Conta a Receber (Sintético)
        const contaReceberData = {
            cliente_id: clienteSelecionadoId,
            empresa_id: empresaId,
            descricao: `Contrato: ${modelo.titulo} - ${clientes.find(c => c.id === clienteSelecionadoId)?.nome || 'Cliente Desconhecido'}`,
            valor_total: valorFinalContrato,
            data_emissao: format(new Date(), 'yyyy-MM-dd'),
            data_vencimento: parcelasParaInserir[0].data_vencimento, // Primeiro vencimento
            tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente',
            status: 'aberta',
            origem: 'contrato',
            contrato_gerado_id: contratoGeradoId,
        };
        
        const { data: contaReceber, error: contaReceberError } = await supabase
            .from('contas_receber')
            .insert(contaReceberData)
            .select('id')
            .single();
            
        if (contaReceberError) throw contaReceberError;
        
        const contaReceberId = contaReceber.id;
        
        // 6. Inserir as Parcelas (Analítico)
        const parcelasComId = parcelasParaInserir.map(p => ({ 
            ...p, 
            conta_receber_id: contaReceberId, 
            empresa_id: empresaId 
        }));
        
        const { error: parcelError } = await supabase
            .from('parcelas_contas_receber')
            .insert(parcelasComId);
            
        if (parcelError) throw parcelError;

        showSuccess('Contrato e Contas a Receber gerados com sucesso!');
        navigate('/contratos');
        
    } catch (error: any) {
        console.error('Erro ao salvar contrato:', error);
        showError('Falha ao salvar contrato e gerar contas: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
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
  
  if (!modelo) {
      return <LayoutPrincipal><Card><CardHeader><CardTitle>Erro</CardTitle></CardHeader><CardContent><p>Modelo de contrato não encontrado.</p></CardContent></Card></LayoutPrincipal>;
  }

  const isRepetirOuParcelar = tipoLancamento !== 'unico';
  const valorLabel = tipoLancamento === 'parcelar' ? 'Valor Total a Parcelar' : 'Valor da Parcela';

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Link to="/contratos" className="text-muted-foreground hover:text-primary flex items-center mr-4">
            <ChevronLeft className="w-5 h-5" />
            Voltar
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> Preencher Contrato: {modelo.titulo}
        </h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna 1: Dados Principais (Financeiro) */}
        <Card className="lg:col-span-1 h-fit">
            <CardHeader><CardTitle className="text-xl">Dados Financeiros</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                
                {/* 1. Cliente */}
                <div className="space-y-2">
                    <Label htmlFor="cliente">Cliente</Label>
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId}>
                        <SelectTrigger id="cliente">
                            <SelectValue placeholder="Selecione o Cliente" />
                        </SelectTrigger>
                        <SelectContent>
                            {clientes.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                {/* 2. Forma de Pagamento */}
                <div className="space-y-4">
                    <Label className="font-semibold">Forma de Pagamento</Label>
                    <RadioGroup 
                        value={tipoLancamento} 
                        onValueChange={(value: TipoLancamento) => setTipoLancamento(value)} 
                        className="flex space-x-4 pt-2"
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="unico" id="unico" />
                            <Label htmlFor="unico" className="font-normal">Único</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="repetir" id="repetir" />
                            <Label htmlFor="repetir" className="font-normal">Repetir Valor</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="parcelar" id="parcelar" />
                            <Label htmlFor="parcelar" className="font-normal">Parcelar Valor</Label>
                        </div>
                    </RadioGroup>
                </div>

                {/* 3. Valor */}
                <div className="space-y-2">
                    <Label htmlFor="valor-total">{valorLabel}</Label>
                    <Input 
                        id="valor-total"
                        type="number"
                        step="0.01"
                        value={valorTotal}
                        onChange={(e) => setValorTotal(Number(e.target.value))}
                        placeholder="0.00"
                    />
                </div>

                {/* 4. Vencimento (Condicional) */}
                {tipoLancamento === 'unico' && (
                    <div className="space-y-2">
                        <Label htmlFor="data-vencimento">Data de Vencimento</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !dataVencimentoUnico && "text-muted-foreground")}>
                                    {dataVencimentoUnico ? format(dataVencimentoUnico, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} initialFocus />
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
                
                {isRepetirOuParcelar && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="parcelas">Nº de Repetições/Parcelas</Label>
                            <Input 
                                id="parcelas"
                                type="number"
                                min="1"
                                value={numeroParcelas}
                                onChange={(e) => setNumeroParcelas(Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="intervalo-dias">Intervalo (dias)</Label>
                            <Input 
                                id="intervalo-dias"
                                type="number"
                                min="1"
                                value={intervaloDias}
                                onChange={(e) => setIntervaloDias(Number(e.target.value))}
                                placeholder="30"
                            />
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="data-primeiro-vencimento">Data do 1º Vencimento</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !dataPrimeiroVencimento && "text-muted-foreground")}>
                                        {dataPrimeiroVencimento ? format(dataPrimeiroVencimento, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
        
        {/* Coluna 2: Preenchimento das Tags */}
        <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-xl">2. Preenchimento das Tags Dinâmicas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {tags.length === 0 ? (
                    <p className="text-muted-foreground">Nenhuma tag dinâmica cadastrada para esta empresa.</p>
                ) : (
                    tags.map(tag => (
                        <div key={tag.id} className="space-y-1">
                            <Label htmlFor={tag.nome_tag} className="font-semibold">{tag.descricao} ({tag.nome_tag})</Label>
                            <Input 
                                id={tag.nome_tag}
                                value={valoresTags[tag.nome_tag] || ''}
                                onChange={(e) => handleTagChange(tag.nome_tag, e.target.value)}
                                placeholder={`Insira o valor para ${tag.nome_tag}`}
                            />
                            {tag.origem_dado && <p className="text-xs text-muted-foreground mt-1">Sugestão de origem: {tag.origem_dado}</p>}
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
        
        {/* Botão de Salvar */}
        <div className="lg:col-span-3">
            <Button 
                onClick={handleSalvarContrato} 
                className="w-full h-12"
                disabled={isSubmitting || !clienteSelecionadoId || valorTotal === ''}
            >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Contrato e Gerar Contas a Receber
            </Button>
        </div>
        
      </div>
    </LayoutPrincipal>
  );
};

export default PreencherContrato;