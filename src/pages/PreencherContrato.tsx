import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, CalendarIcon, Eye } from 'lucide-react';
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
import { format, addDays } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/ContratoPreviewDialog'; // Importando o novo componente

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';
type TipoConteudo = 'html' | 'texto'; // Definindo o tipo

interface EmpresaLogada {
    nome: string;
    email: string;
    documento?: string | null;
    endereco_completo?: string | null;
}

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [tags, setTags] = useState<ContratoTag[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [empresaLogada, setEmpresaLogada] = useState<EmpresaLogada | null>(null);
  
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Estados para a prévia
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  
  // Novo estado para o tipo de conteúdo (assumindo HTML por padrão do modelo)
  const [tipoConteudo, setTipoConteudo] = useState<TipoConteudo>('html'); 
  
  // Campos obrigatórios para o contrato
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number | ''>('');
  
  // Campos de Forma de Pagamento
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(undefined);
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(undefined);
  const [intervaloDias, setIntervaloDias] = useState<number>(30); // Usado para Repetir/Parcelar

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  // ID do proprietário (Admin ou Cliente)
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (date: Date) => format(date, 'dd/MM/yyyy');

  const buscarDados = useCallback(async () => {
    if (!modeloId || !ownerId) {
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
    
    // 2. Buscar Tags (apenas as do ownerId)
    const { data: tagsData, error: tagsError } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', ownerId)
        .order('nome_tag');
        
    if (tagsError) {
        showError('Erro ao carregar tags: ' + tagsError.message);
        setTags([]);
    } else {
        setTags(tagsData as ContratoTag[]);
    }
    
    // 3. Buscar Clientes (apenas os do ownerId)
    let fetchedClientes: Cliente[] = [];
    if (ownerId) {
        const { data: clientesData, error: clientesError } = await supabase
            .from('clientes')
            .select('*')
            .eq('empresa_id', ownerId)
            .order('nome');
            
        if (clientesError) {
            showError('Erro ao carregar clientes: ' + clientesError.message);
        } else {
            fetchedClientes = clientesData as Cliente[];
            setClientes(fetchedClientes);
        }
    }
    
    // 4. Buscar Dados da Empresa Logada (Cliente/Admin)
    if (isAdmin) {
        const profile = perfil as ClienteProfile; // Admin usa o perfil de Admin, mas buscamos dados básicos
        setEmpresaLogada({
            nome: profile.nome,
            email: profile.email,
            documento: null, // Admin não tem documento na tbl_admins
            endereco_completo: null,
        });
    } else if (isCliente) {
        const profile = perfil as ClienteProfile;
        setEmpresaLogada({
            nome: profile.nome,
            email: profile.email,
            documento: profile.documento,
            endereco_completo: profile.endereco_completo,
        });
    } else if (role === 'Usuario' && ownerId) {
        // Se for usuário, busca os dados da empresa vinculada
        const { data: empresaData } = await supabase.from('tbl_clientes').select('nome, email, documento, endereco_completo').eq('id', ownerId).single();
        if (empresaData) {
            setEmpresaLogada(empresaData);
        }
    }
    
    // 5. Determinar o tipo de conteúdo do modelo
    const isHtmlContent = modeloData?.conteudo_template?.trim().startsWith('<') ?? true;
    setTipoConteudo(isHtmlContent ? 'html' : 'texto');

    setCarregandoDados(false);
  }, [modeloId, ownerId, navigate, role, perfil, usuario, isAdmin, isCliente]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || isCliente || (role === 'Usuario' && ownerId))) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isCliente) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, isAdmin, isCliente, role, ownerId, buscarDados, navigate]);
  
  // Efeito para preencher tags padrão automaticamente
  useEffect(() => {
    const updateTags = () => {
        const newTags: Record<string, string> = {};
        const cliente = clientes.find(c => c.id === clienteSelecionadoId);
        
        const valorNumerico = Number(valorTotal);
        const numParcelas = Number(numeroParcelas);
        
        const valorFinalContrato = tipoLancamento === 'repetir' ? valorNumerico * numParcelas : valorNumerico;
        const valorParcela = tipoLancamento === 'parcelar' ? (valorNumerico / numParcelas) : valorNumerico;
        
        let primeiroVencimento: Date | undefined;
        if (tipoLancamento === 'unico') {
            primeiroVencimento = dataVencimentoUnico;
        } else {
            primeiroVencimento = dataPrimeiroVencimento;
        }

        // Preenchimento das Tags Padrão
        TAGS_PADRAO.forEach(tag => {
            switch (tag.nome_tag) {
                // EMPRESA
                case '{{EMPRESA_NOME}}':
                    newTags[tag.nome_tag] = empresaLogada?.nome || 'N/A';
                    break;
                case '{{EMPRESA_EMAIL}}':
                    newTags[tag.nome_tag] = empresaLogada?.email || 'N/A';
                    break;
                case '{{EMPRESA_DOCUMENTO}}':
                    newTags[tag.nome_tag] = empresaLogada?.documento || 'N/A';
                    break;
                case '{{EMPRESA_ENDERECO}}':
                    newTags[tag.nome_tag] = empresaLogada?.endereco_completo || 'N/A';
                    break;
                    
                // CLIENTE
                case '{{CLIENTE_NOME}}':
                    newTags[tag.nome_tag] = cliente?.nome_fantasia || cliente?.nome || 'N/A';
                    break;
                case '{{CLIENTE_RAZAO_SOCIAL}}':
                    newTags[tag.nome_tag] = cliente?.razao_social || 'N/A';
                    break;
                case '{{CLIENTE_DOCUMENTO}}':
                    newTags[tag.nome_tag] = cliente?.documento || 'N/A';
                    break;
                case '{{CLIENTE_EMAIL}}':
                    newTags[tag.nome_tag] = cliente?.email || 'N/A';
                    break;
                case '{{CLIENTE_ENDERECO}}':
                    newTags[tag.nome_tag] = cliente?.endereco && cliente?.numero ? `${cliente.endereco}, ${cliente.numero}` : 'N/A';
                    break;
                case '{{CLIENTE_BAIRRO}}':
                    newTags[tag.nome_tag] = cliente?.bairro || 'N/A';
                    break;
                case '{{CLIENTE_CIDADE}}':
                    newTags[tag.nome_tag] = cliente?.cidade || 'N/A';
                    break;
                case '{{CLIENTE_ESTADO}}':
                    newTags[tag.nome_tag] = cliente?.estado || 'N/A';
                    break;
                    
                // FINANCEIRO
                case '{{VALOR_TOTAL_CONTRATO}}':
                    newTags[tag.nome_tag] = formatCurrency(valorFinalContrato);
                    break;
                case '{{VALOR_PARCELA}}':
                    newTags[tag.nome_tag] = formatCurrency(valorParcela);
                    break;
                case '{{NUMERO_PARCELAS}}':
                    newTags[tag.nome_tag] = String(numParcelas);
                    break;
                case '{{PRIMEIRO_VENCIMENTO}}':
                    newTags[tag.nome_tag] = primeiroVencimento ? formatDate(primeiroVencimento) : 'N/A';
                    break;
                case '{{DATA_EMISSAO}}':
                    newTags[tag.nome_tag] = formatDate(new Date());
                    break;
                default:
                    // Mantém o valor preenchido manualmente pelo usuário para tags customizadas
                    newTags[tag.nome_tag] = valoresTags[tag.nome_tag] || '';
                    break;
            }
        });
        
        // Atualiza o estado de valoresTags, mantendo as tags customizadas
        setValoresTags(prev => {
            const customTags = Object.keys(prev).filter(key => !TAGS_PADRAO.some(t => t.nome_tag === key));
            const updatedTags = { ...newTags };
            customTags.forEach(key => {
                updatedTags[key] = prev[key];
            });
            return updatedTags;
        });
    };
    
    updateTags();
  }, [clienteSelecionadoId, valorTotal, tipoLancamento, numeroParcelas, dataVencimentoUnico, dataPrimeiroVencimento, clientes, empresaLogada]);


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
    
    // Se for texto simples, converte quebras de linha para <br> para renderização HTML
    if (tipoConteudo === 'texto') {
        conteudoRenderizado = conteudoRenderizado.replace(/\n/g, '<br>');
    }
    
    return conteudoRenderizado;
  };
  
  const handlePreview = () => {
      if (!modelo) return;
      const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
      setConteudoPreview(conteudoRenderizado);
      setPreviewOpen(true);
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
                status: 'aberta'
            });
        }
    }
    return parcelas;
  };

  const handleSalvarContrato = async () => {
    const valorNumerico = Number(valorTotal);
    const numParcelas = Number(numeroParcelas);
    
    // 1. Validação
    if (!modelo || !clienteSelecionadoId || valorTotal === '' || !ownerId || valorNumerico <= 0) {
        showError('Preencha Cliente, Valor Total e Proprietário.');
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
            empresa_id: ownerId, // ID do Admin/Cliente
            status: 'pendente_assinatura',
            valor_total: valorFinalContrato,
            data_inicio: format(new Date(), 'yyyy-MM-dd'), // Data de criação do contrato
            numero_parcelas: numParcelas,
            dia_vencimento_parcela: tipoLancamento === 'unico' ? null : intervaloDias, // Usando intervaloDias aqui para simplificar o campo
            valores_tags_preenchidos: { ...valoresTags, tipo_conteudo: tipoConteudo }, // SALVANDO O TIPO DE CONTEÚDO
            conteudo_renderizado: conteudoRenderizado,
            // link_assinatura_externo e documento_assinado_url serão preenchidos depois
        };
        
        const { data: contratoGerado, error: contratoError } = await supabase
            .from('contratos_gerados')
            .insert(contratoData)
            .select('id')
            .single();
            
        if (contratoError) throw contratoError;
        
        const contratoGeradoId = contratoGerado.id;
        
        // 5. Inserir a Conta a Receber (Sintético)
        const clienteNome = clientes.find(c => c.id === clienteSelecionadoId)?.nome || 'Cliente Desconhecido';
        const contaReceberData = {
            cliente_id: clienteSelecionadoId,
            empresa_id: ownerId, // ID do Admin/Cliente
            descricao: `Contrato: ${modelo.titulo} - ${clienteNome}`,
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
            empresa_id: ownerId // ID do Admin/Cliente
        }));
        
        const { error: parcelError } = await supabase
            .from('parcelas_contas_receber')
            .insert(parcelasComId);
            
        if (parcelError) throw parcelError;

        showSuccess('Contrato gerado e enviado para assinatura!');
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
  
  // Filtra tags customizadas (que não são padrão)
  const tagsCustomizadas = tags.filter(tag => !TAGS_PADRAO.some(t => t.nome_tag === tag.nome_tag));

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
                <div className="p-3 bg-secondary rounded-md">
                    <h3 className="font-semibold text-sm mb-1">Tags Padrão (Preenchimento Automático)</h3>
                    <div className="flex flex-wrap gap-2">
                        {TAGS_PADRAO.map(tag => (
                            <span key={tag.id} className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                                {tag.nome_tag}
                            </span>
                        ))}
                    </div>
                </div>
                
                {tagsCustomizadas.length === 0 ? (
                    <p className="text-muted-foreground">Nenhuma tag customizada cadastrada para esta empresa.</p>
                ) : (
                    tagsCustomizadas.map(tag => (
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
        
        {/* Botões de Ação */}
        <div className="lg:col-span-3 flex flex-col sm:flex-row gap-4">
            <Button 
                onClick={handlePreview} 
                variant="outline"
                className="flex-1 h-12"
                disabled={!modelo || !clienteSelecionadoId || valorTotal === ''}
            >
                <Eye className="mr-2 h-4 w-4" />
                Visualizar Contrato
            </Button>
            <Button 
                onClick={handleSalvarContrato} 
                className="flex-1 h-12"
                disabled={isSubmitting || !clienteSelecionadoId || valorTotal === ''}
            >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar e Gerar Contas a Receber
            </Button>
        </div>
        
      </div>
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={modelo?.titulo || 'Prévia'}
        isHtml={tipoConteudo === 'html'} // Passando o tipo de conteúdo
      />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;