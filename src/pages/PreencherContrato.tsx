import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, CalendarIcon, Eye, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag, ContratoGerado } from '@/types/contratos';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClienteProfile, AdminProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, parseISO } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';
import { Separator } from '@/components/ui/separator';
import { ptBR } from 'date-fns/locale';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get('contratoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente'; 

  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [clientesCR, setClientesCR] = useState<any[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  
  // Estados do Formulário
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number>(0); 
  const [tituloDocumento, setTituloDocumento] = useState('');
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<any[]>([]);
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(new Date());
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(new Date());
  const [intervaloDias, setIntervaloDias] = useState<number>(30);

  const isEditing = !!contratoId;

  const ownerIdLogado = useMemo(() => {
    if (carregandoSessao) return null;
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as any)?.admin_id || (perfil as any)?.cliente_id || null;
    return null;
  }, [carregandoSessao, isAdmin, isCliente, role, usuario, perfil]);

  // Função auxiliar de formatação de moeda
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const fetchDependentData = useCallback(async (targetId: string) => {
    if (!targetId) return;
    
    // 1. Busca Tags (tags de contrato são sempre por empresa_id)
    const { data: tagsData } = await supabase
      .from('contrato_tags')
      .select('*')
      .eq('empresa_id', targetId);
      
    if (tagsData) setTagsCustomizadas(tagsData);

    // 2. Busca Clientes (Lógica Diferenciada)
    let fetchedClients: any[] = [];
    
    // Se for Admin e estiver criando contrato para si mesmo (targetId == seu ID de Admin),
    // a lista de "clientes" são as empresas do sistema (tbl_clientes).
    const isTargetAdminSelf = isAdmin && targetId === ownerIdLogado;

    if (isTargetAdminSelf) {
        // Busca de tbl_clientes (Empresas do Sistema que o Admin gerencia)
        const { data } = await supabase
            .from('tbl_clientes')
            .select('id, nome, documento, email, telefone, cep, endereco, numero, complemento, bairro, cidade, estado, cpf, cnpj, rg, razao_social, nome_fantasia')
            .eq('admin_id', targetId)
            // .eq('aprovado', true) // Removido para permitir contratos com pendentes, se desejar
            .order('nome');
            
        fetchedClients = data || [];
    } else {
        // Caso contrário (Cliente logado ou Admin impersonando cliente),
        // busca da tabela `clientes` (clientes de CR/Contratos dessa empresa).
        const { data } = await supabase
            .from('clientes')
            .select('*')
            .eq('proprietario_id', targetId)
            .order('nome');
            
        fetchedClients = data || [];
    }

    // Desduplicação por ID
    const uniqueClients = Array.from(new Map(fetchedClients.map(item => [item.id, item])).values());
    setClientesCR(uniqueClients);

  }, [isAdmin, ownerIdLogado]);

  const buscarDados = useCallback(async () => {
    setCarregandoDados(true);
    
    // 1. Carregar Modelo
    if (modeloId) {
      const { data } = await supabase.from('contrato_modelos').select('*').eq('id', modeloId).single();
      if (data) {
        setModelo(data);
        setTituloDocumento(data.titulo);
      }
    }
    
    // 2. Carregar Empresas (Se Admin)
    if (isAdmin && ownerIdLogado) {
      const { data } = await supabase.from('tbl_clientes').select('id, nome').eq('aprovado', true);
      const options = [{ id: ownerIdLogado, nome: 'Meus Contratos' }, ...(data || [])];
      setEmpresasContrato(options);
    }
    
    // Define o proprietário inicial
    setProprietarioContratoId(ownerIdLogado);
    
    // Carrega dados dependentes (clientes, tags)
    await fetchDependentData(ownerIdLogado!);
    
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, isAdmin, fetchDependentData]);

  // Carregamento inicial
  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) buscarDados();
  }, [carregandoSessao, ownerIdLogado, buscarDados]);

  // Se o proprietário mudar (no select do Admin), recarrega clientes
  useEffect(() => {
      if (proprietarioContratoId) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData]);

  // Dados da Empresa (Contratante) para preenchimento de tags
  const empresaLogadaData = useMemo(() => {
    if (!perfil) return null;
    // Se for Admin e estiver criando para um cliente, precisaríamos buscar os dados desse cliente.
    // Por simplificação, se for Admin criando "Meus Contratos", usa o perfil do Admin.
    // Se for Cliente, usa o perfil do Cliente.
    
    const p = perfil as ClienteProfile | AdminProfile | UsuarioProfile | AdminUsuarioProfile;
    
    // Helper seguro para acessar propriedades que podem não existir em todos os tipos
    const safeGet = (obj: any, key: string) => obj && obj[key] ? obj[key] : '';
    
    return {
        nome: safeGet(p, 'nome') || safeGet(p, 'razao_social'),
        documento: safeGet(p, 'documento') || safeGet(p, 'cnpj') || safeGet(p, 'cpf'),
        email: safeGet(p, 'email'),
        telefone: safeGet(p, 'telefone'),
        cep: safeGet(p, 'cep'),
        endereco: safeGet(p, 'endereco'),
        numero: safeGet(p, 'numero'),
        complemento: safeGet(p, 'complemento'),
        bairro: safeGet(p, 'bairro'),
        cidade: safeGet(p, 'cidade'),
        estado: safeGet(p, 'estado'),
        cnpj: safeGet(p, 'cnpj'),
        cpf: safeGet(p, 'cpf'),
        rg: safeGet(p, 'rg'),
    };
  }, [perfil]);

  // --- LÓGICA DE PREENCHIMENTO AUTOMÁTICO DAS TAGS ---
  useEffect(() => {
      const newTags: Record<string, string> = { ...valoresTags };
      
      // 1. Dados do Cliente Selecionado
      const cliente = clientesCR.find(c => c.id === clienteSelecionadoId);
      
      if (cliente) {
          newTags['{{CLIENTE_NOME}}'] = cliente.nome || '';
          newTags['{{CLIENTE_RAZAO_SOCIAL}}'] = cliente.razao_social || cliente.nome || '';
          newTags['{{CLIENTE_NOME_FANTASIA}}'] = cliente.nome_fantasia || '';
          newTags['{{CLIENTE_DOCUMENTO}}'] = cliente.documento || cliente.cpf || cliente.cnpj || '';
          newTags['{{CLIENTE_CPF}}'] = cliente.cpf || '';
          newTags['{{CLIENTE_CNPJ}}'] = cliente.cnpj || '';
          newTags['{{CLIENTE_RG}}'] = cliente.rg || '';
          newTags['{{CLIENTE_EMAIL}}'] = cliente.email || '';
          newTags['{{CLIENTE_TELEFONE}}'] = cliente.telefone || '';
          newTags['{{CLIENTE_TELEFONE_FIXO}}'] = cliente.telefone_fixo || '';
          newTags['{{CLIENTE_CEP}}'] = cliente.cep || '';
          newTags['{{CLIENTE_ENDERECO}}'] = cliente.endereco || '';
          newTags['{{CLIENTE_NUMERO}}'] = cliente.numero || '';
          newTags['{{CLIENTE_COMPLEMENTO}}'] = cliente.complemento || '';
          newTags['{{CLIENTE_BAIRRO}}'] = cliente.bairro || '';
          newTags['{{CLIENTE_CIDADE}}'] = cliente.cidade || '';
          newTags['{{CLIENTE_ESTADO}}'] = cliente.estado || '';
          newTags['{{CLIENTE_DATA_NASCIMENTO}}'] = cliente.data_nascimento ? format(parseISO(cliente.data_nascimento), 'dd/MM/yyyy') : '';
      }

      // 2. Dados da Empresa (CONTRATADA - Escritório/Dono do Sistema)
      // Nota: Idealmente buscaríamos os dados da empresa selecionada no select "Empresa Contratante"
      // Por enquanto, usa os dados de quem está logado como fallback ou principal.
      if (empresaLogadaData) {
          newTags['{{EMPRESA_NOME}}'] = empresaLogadaData.nome || '';
          newTags['{{EMPRESA_DOCUMENTO}}'] = empresaLogadaData.documento || '';
          newTags['{{EMPRESA_EMAIL}}'] = empresaLogadaData.email || '';
          newTags['{{EMPRESA_TELEFONE}}'] = empresaLogadaData.telefone || '';
          newTags['{{EMPRESA_CEP}}'] = empresaLogadaData.cep || '';
          newTags['{{EMPRESA_ENDERECO}}'] = empresaLogadaData.endereco || '';
          newTags['{{EMPRESA_NUMERO}}'] = empresaLogadaData.numero || '';
          newTags['{{EMPRESA_COMPLEMENTO}}'] = empresaLogadaData.complemento || '';
          newTags['{{EMPRESA_BAIRRO}}'] = empresaLogadaData.bairro || '';
          newTags['{{EMPRESA_CIDADE}}'] = empresaLogadaData.cidade || '';
          newTags['{{EMPRESA_ESTADO}}'] = empresaLogadaData.estado || '';
          newTags['{{EMPRESA_CNPJ}}'] = empresaLogadaData.cnpj || '';
          newTags['{{EMPRESA_CPF}}'] = empresaLogadaData.cpf || '';
      }

      // 3. Dados Financeiros
      let valorFinalContrato = 0;
      let valorParcelaFinal = 0;
      let dataPrimeiroVenc = '';

      if (tipoLancamento === 'unico') {
          valorFinalContrato = valorTotal;
          valorParcelaFinal = valorTotal;
          dataPrimeiroVenc = dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy') : '';
      } else if (tipoLancamento === 'parcelar') {
          valorFinalContrato = valorTotal;
          valorParcelaFinal = numeroParcelas > 0 ? valorTotal / numeroParcelas : 0;
          dataPrimeiroVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';
      } else if (tipoLancamento === 'repetir') {
          valorFinalContrato = valorTotal * numeroParcelas;
          valorParcelaFinal = valorTotal;
          dataPrimeiroVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';
      }

      newTags['{{VALOR_TOTAL_CONTRATO}}'] = formatCurrency(valorFinalContrato);
      newTags['{{VALOR_PARCELA}}'] = formatCurrency(valorParcelaFinal);
      newTags['{{NUMERO_PARCELAS}}'] = numeroParcelas.toString();
      newTags['{{PRIMEIRO_VENCIMENTO}}'] = dataPrimeiroVenc;
      newTags['{{DATA_EMISSAO}}'] = format(new Date(), 'dd/MM/yyyy');
      
      setValoresTags(newTags);

  }, [
      clienteSelecionadoId, 
      clientesCR, 
      empresaLogadaData, 
      valorTotal, 
      tipoLancamento, 
      numeroParcelas, 
      dataVencimentoUnico, 
      dataPrimeiroVencimento,
  ]);

  // Filtro para mostrar tags manuais na UI
  const tagsParaPreenchimentoManual = useMemo(() => {
    const combined = [...TAGS_PADRAO, ...tagsCustomizadas];
    return combined
        .filter(tag => 
            !tag.nome_tag.startsWith('{{CLIENTE_') && 
            !tag.nome_tag.startsWith('{{EMPRESA_') &&
            !['{{VALOR_TOTAL_CONTRATO}}', '{{VALOR_PARCELA}}', '{{NUMERO_PARCELAS}}', '{{PRIMEIRO_VENCIMENTO}}', '{{DATA_EMISSAO}}'].includes(tag.nome_tag)
        )
        .map(t => t.nome_tag);
  }, [tagsCustomizadas]);

  const renderConteudo = useCallback(() => {
    let html = modelo?.conteudo_template || '';
    Object.keys(valoresTags).forEach(tag => {
      const regex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      html = html.replace(regex, valoresTags[tag] || tag);
    });
    return html;
  }, [modelo, valoresTags]);

  const handleSalvarContrato = async (status: string) => {
    const dataInicio = tipoLancamento === 'unico' ? dataVencimentoUnico : dataPrimeiroVencimento;
    
    if (!clienteSelecionadoId || !proprietarioContratoId || !dataInicio) {
        showError('Preencha o cliente, proprietário e as datas de vencimento.');
        return;
    }

    setIsSubmitting(true);
    try {
        let valorTotalFinal = valorTotal;
        if (tipoLancamento === 'repetir') valorTotalFinal = valorTotal * numeroParcelas;

        const payload = {
            modelo_id: modelo?.id,
            cliente_id: clienteSelecionadoId,
            proprietario_id: proprietarioContratoId,
            status,
            valor_total: valorTotalFinal,
            data_inicio: format(dataInicio, 'yyyy-MM-dd'),
            numero_parcelas: tipoLancamento === 'unico' ? 1 : numeroParcelas,
            valores_tags_preenchidos: valoresTags,
            conteudo_renderizado: renderConteudo(),
        };

        const { error } = isEditing 
            ? await supabase.from('contratos_gerados').update(payload).eq('id', contratoId)
            : await supabase.from('contratos_gerados').insert(payload);

        if (error) throw error;
        showSuccess('Contrato processado com sucesso');
        navigate('/contratos');
    } catch (e: any) {
        showError(e.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Button onClick={() => navigate('/contratos')} variant="link" className="p-0 mr-4"><ChevronLeft /> Voltar</Button>
        <h1 className="text-2xl font-bold">Preencher: {modelo?.titulo}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>1. Identificação e Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isAdmin && (
                <div className="space-y-2">
                  <Label>Empresa Contratante</Label>
                  <Select value={proprietarioContratoId || ''} onValueChange={setProprietarioContratoId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{empresasContrato.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Título do Documento</Label>
                <Input value={tituloDocumento} onChange={e => setTituloDocumento(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cliente (Contratado)</Label>
                <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o Cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientesCR.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                            {c.nome} {c.documento ? `(${c.documento})` : ''}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. Detalhes Financeiros</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Base (R$)</Label>
                  <Input type="number" value={valorTotal} onChange={e => setValorTotal(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Lançamento</Label>
                  <RadioGroup value={tipoLancamento} onValueChange={(v: any) => setTipoLancamento(v)} className="flex space-x-2 pt-2">
                    <div className="flex items-center space-x-1"><RadioGroupItem value="unico" id="u"/><Label htmlFor="u">Único</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="parcelar" id="p"/><Label htmlFor="p">Parcelar</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="repetir" id="r"/><Label htmlFor="r">Repetir</Label></div>
                  </RadioGroup>
                </div>
              </div>

              {tipoLancamento === 'unico' ? (
                <div className="space-y-2">
                  <Label>Data de Vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} initialFocus locale={ptBR} /></PopoverContent>
                  </Popover>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2"><Label>Parcelas</Label><Input type="number" value={numeroParcelas} onChange={e => setNumeroParcelas(Number(e.target.value))} /></div>
                  <div className="space-y-2"><Label>Intervalo</Label><Input type="number" value={intervaloDias} onChange={e => setIntervaloDias(Number(e.target.value))} /></div>
                  <div className="space-y-2">
                    <Label>1º Vencimento</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dataPrimeiroVencimento && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy', { locale: ptBR }) : <span>Selecione</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} initialFocus locale={ptBR} /></PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Tags Manuais (Outras)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {tagsParaPreenchimentoManual.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag manual extra detectada.</p>}
              {tagsParaPreenchimentoManual.map(tag => (
                <div key={tag} className="space-y-1">
                  <Label className="text-xs">{tag}</Label>
                  <Input placeholder={`Valor para ${tag}`} value={valoresTags[tag] || ''} onChange={e => setValoresTags(prev => ({...prev, [tag]: e.target.value}))} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit sticky top-6">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              Prévia do Documento
              <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4 mr-2" /> Ampliar</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border p-6 rounded bg-slate-50 min-h-[400px] text-sm overflow-y-auto max-h-[600px] ql-editor" 
                 dangerouslySetInnerHTML={{ __html: renderConteudo() }} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end space-x-4">
        <Button variant="secondary" onClick={() => handleSalvarContrato('rascunho')} disabled={isSubmitting}><Save className="mr-2 h-4 w-4"/> Rascunho</Button>
        <Button onClick={() => handleSalvarContrato('pendente_assinatura')} disabled={isSubmitting}>Gerar e Enviar</Button>
      </div>

      <ContratoPreviewDialog 
        open={previewOpen} 
        onOpenChange={setPreviewOpen} 
        conteudoHtml={renderConteudo()} 
        titulo={tituloDocumento} 
        isHtml={true} 
      />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;