import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, CalendarIcon, Eye, Building2, AlertTriangle } from 'lucide-react';
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
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { useCapitalSocial } from '@/hooks/use-capital-social';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { v4 as uuidv4 } from 'uuid';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get('contratoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const { configMap } = useContabilConfig();
  const { temCapitalSocial, carregando: carregandoCapital } = useCapitalSocial();
  
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente'; 

  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [clientesCR, setClientesCR] = useState<any[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({}); 
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
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
  const [contratoInicial, setContratoInicial] = useState<ContratoGerado | null>(null);

  const isEditing = !!contratoId;

  const ownerIdLogado = useMemo(() => {
    if (carregandoSessao) return null;
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as any)?.admin_id || (perfil as any)?.cliente_id || null;
    return null;
  }, [carregandoSessao, isAdmin, isCliente, role, usuario, perfil]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const fetchDependentData = useCallback(async (targetId: string) => {
    if (!targetId) return;
    
    // 1. Busca Tags Customizadas
    const { data: tagsData } = await supabase
      .from('contrato_tags')
      .select('*')
      .eq('empresa_id', targetId);
      
    if (tagsData) setTagsCustomizadas(tagsData);

    // 2. Busca Clientes
    const { data: adminCheck } = await supabase.from('tbl_admins').select('id').eq('id', targetId).maybeSingle();
    const isTargetAdmin = !!adminCheck;

    let finalClientList: any[] = [];
    if (isTargetAdmin) {
        const { data: dataSistema } = await supabase.from('tbl_clientes').select('*').eq('admin_id', targetId).eq('aprovado', true).order('nome');
        finalClientList = dataSistema || [];
    } else {
        const { data: dataCR } = await supabase.from('clientes').select('*').eq('proprietario_id', targetId).order('nome');
        finalClientList = dataCR || [];
    }
    setClientesCR(finalClientList);
  }, []);

  const buscarDados = useCallback(async () => {
    setCarregandoDados(true);
    
    if (modeloId) {
      const { data } = await supabase.from('contrato_modelos').select('*').eq('id', modeloId).single();
      if (data) {
        setModelo(data);
        setTituloDocumento(data.titulo);
      }
    }
    
    if (isAdmin && ownerIdLogado) {
      const { data } = await supabase.from('tbl_clientes').select('id, nome').eq('admin_id', ownerIdLogado).eq('aprovado', true);
      const options = [{ id: ownerIdLogado, nome: 'Meus Contratos' }, ...(data || [])];
      setEmpresasContrato(options);
    }
    
    let currentPropId = ownerIdLogado;
    if (contratoId) {
        const { data: contratoExistente } = await supabase.from('contratos_gerados').select('*').eq('id', contratoId).single();
        if (contratoExistente) {
            setContratoInicial(contratoExistente);
            setClienteSelecionadoId(contratoExistente.cliente_id);
            setProprietarioContratoId(contratoExistente.proprietario_id);
            currentPropId = contratoExistente.proprietario_id;
            setValorTotal(contratoExistente.valor_total || 0);
            setNumeroParcelas(contratoExistente.numero_parcelas || 1);
            if (contratoExistente.numero_parcelas > 1) setTipoLancamento('parcelar');
            if (contratoExistente.data_inicio) {
                const d = parseISO(contratoExistente.data_inicio);
                setDataVencimentoUnico(d);
                setDataPrimeiroVencimento(d);
            }
            if (contratoExistente.valores_tags_preenchidos) {
                setValoresTags(contratoExistente.valores_tags_preenchidos as Record<string, string>);
            }
        }
    } else {
        setProprietarioContratoId(ownerIdLogado);
    }
    
    if (currentPropId) await fetchDependentData(currentPropId);
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, isAdmin, fetchDependentData, contratoId]);

  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) buscarDados();
  }, [carregandoSessao, ownerIdLogado, buscarDados]);

  // --- LÓGICA DE PREENCHIMENTO DE TAGS (REESTRUTURADA PARA EVITAR LOOP) ---
  useEffect(() => {
      if (carregandoDados || !ownerIdLogado) return;

      const newSystemTags: Record<string, string> = {};
      const cliente = clientesCR.find(c => c.id === clienteSelecionadoId);
      const p = perfil as any;

      // 1. Tags do Cliente
      if (cliente) {
          newSystemTags['{{CLIENTE_NOME}}'] = cliente.nome || '';
          newSystemTags['{{CLIENTE_DOCUMENTO}}'] = cliente.documento || cliente.cpf || cliente.cnpj || '';
          newSystemTags['{{CLIENTE_EMAIL}}'] = cliente.email || '';
          newSystemTags['{{CLIENTE_TELEFONE}}'] = cliente.telefone || '';
          newSystemTags['{{CLIENTE_ENDERECO}}'] = cliente.endereco || '';
          newSystemTags['{{CLIENTE_CIDADE}}'] = cliente.cidade || '';
          newSystemTags['{{CLIENTE_ESTADO}}'] = cliente.estado || '';
      }

      // 2. Tags da Empresa
      if (p) {
          newSystemTags['{{EMPRESA_NOME}}'] = p.nome || '';
          newSystemTags['{{EMPRESA_DOCUMENTO}}'] = p.documento || p.cnpj || p.cpf || '';
          newSystemTags['{{EMPRESA_EMAIL}}'] = p.email || '';
      }

      // 3. Tags Financeiras
      let valContrato = valorTotal;
      let valParcela = valorTotal;
      let dataVenc = '';

      if (tipoLancamento === 'unico') {
          dataVenc = dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy') : '';
      } else if (tipoLancamento === 'parcelar') {
          valParcela = numeroParcelas > 0 ? valorTotal / numeroParcelas : 0;
          dataVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';
      } else if (tipoLancamento === 'repetir') {
          valContrato = valorTotal * numeroParcelas;
          dataVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';
      }

      newSystemTags['{{VALOR_TOTAL_CONTRATO}}'] = formatCurrency(valContrato);
      newSystemTags['{{VALOR_PARCELA}}'] = formatCurrency(valParcela);
      newSystemTags['{{NUMERO_PARCELAS}}'] = numeroParcelas.toString();
      newSystemTags['{{PRIMEIRO_VENCIMENTO}}'] = dataVenc;
      newSystemTags['{{DATA_EMISSAO}}'] = format(new Date(), 'dd/MM/yyyy');

      // Mescla com os valores atuais, preservando o que for manual
      setValoresTags(prev => {
          const merged = { ...prev, ...newSystemTags };
          return merged;
      });

  }, [clienteSelecionadoId, valorTotal, tipoLancamento, numeroParcelas, dataVencimentoUnico, dataPrimeiroVencimento, carregandoDados, clientesCR, perfil]);

  const renderConteudo = useCallback(() => {
    let html = modelo?.conteudo_template || '';
    Object.keys(valoresTags).forEach(tag => {
      // Escape especial para a regex não quebrar com chaves
      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedTag, 'g');
      html = html.replace(regex, valoresTags[tag] || '');
    });
    return html;
  }, [modelo, valoresTags]);

  const handlePreview = () => {
    if (!modelo) return;
    setConteudoPreview(renderConteudo());
    setPreviewTitle(tituloDocumento || modelo.titulo);
    setPreviewOpen(true);
  };

  const handleSalvarContrato = async (status: string) => {
    if (!temCapitalSocial && status !== 'rascunho') {
        showError('Lançamento de Capital Social obrigatório para ativar contratos.');
        return;
    }
    
    if (!clienteSelecionadoId || !proprietarioContratoId || valorTotal <= 0) {
        showError('Preencha os campos obrigatórios.');
        return;
    }

    setIsSubmitting(true);
    
    try {
        const { data: configData } = await supabase.from('configuracao_contratos').select('id_conta_clientes_receber, id_conta_receita_contrato').eq('proprietario_id', proprietarioContratoId).single();
        const contaPatrimonialId = configData?.id_conta_clientes_receber || null;
        const contaReceitaId = configData?.id_conta_receita_contrato || null;
        const { data: pConfig } = await supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', proprietarioContratoId).eq('tipo_registro', 'parcela').single();
        const contaParcelaId = pConfig?.conta_contabil_id || null;
        const temConfig = !!contaPatrimonialId && !!contaReceitaId && !!contaParcelaId;

        let vTotal = valorTotal;
        let vParcela = valorTotal;
        let parcelas = [];
        const dataInicio = tipoLancamento === 'unico' ? dataVencimentoUnico! : dataPrimeiroVencimento!;

        if (tipoLancamento === 'unico') {
            parcelas.push({ numero_parcela: 1, valor_parcela: valorTotal, data_vencimento: format(dataInicio, 'yyyy-MM-dd'), status: 'aberta' });
        } else if (tipoLancamento === 'parcelar') {
            vParcela = numeroParcelas > 0 ? valorTotal / numeroParcelas : 0;
            for (let i = 0; i < numeroParcelas; i++) parcelas.push({ numero_parcela: i+1, valor_parcela: vParcela, data_vencimento: format(addDays(dataInicio, i*intervaloDias), 'yyyy-MM-dd'), status: 'aberta' });
        } else {
            vTotal = valorTotal * numeroParcelas;
            for (let i = 0; i < numeroParcelas; i++) parcelas.push({ numero_parcela: i+1, valor_parcela: valorTotal, data_vencimento: format(addDays(dataInicio, i*intervaloDias), 'yyyy-MM-dd'), status: 'aberta' });
        }

        const isPropAdmin = !!(await supabase.from('tbl_admins').select('id').eq('id', proprietarioContratoId).maybeSingle()).data;
        const tCR = isPropAdmin ? 'admin_contas_receber' : 'contas_receber';
        const tP = isPropAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
        const ownerKey = isPropAdmin ? 'admin_id' : 'empresa_id';

        if (isEditing && contratoInicial) {
            const { data: oldCS } = await supabase.from(tCR).select('id').eq('contrato_gerado_id', contratoInicial.id).maybeSingle();
            if (oldCS) {
                await supabase.from('lancamentos').delete().eq('proprietario_id', proprietarioContratoId).ilike('descricao', `%CR ID: ${oldCS.id.substring(0,8)}%`);
                await supabase.from(tCR).delete().eq('id', oldCS.id);
            }
        }

        const cPayload = {
            modelo_id: modelo?.id, cliente_id: clienteSelecionadoId, proprietario_id: proprietarioContratoId,
            status, valor_total: vTotal, data_inicio: format(dataInicio, 'yyyy-MM-dd'),
            numero_parcelas: parcelas.length, valores_tags_preenchidos: { ...valoresTags, titulo: tituloDocumento },
            conteudo_renderizado: renderConteudo(),
        };

        const { data: newC } = isEditing 
            ? await supabase.from('contratos_gerados').update(cPayload).eq('id', contratoId).select('id').single()
            : await supabase.from('contratos_gerados').insert(cPayload).select('id').single();

        const { data: newCS } = await supabase.from(tCR).insert({
            [ownerKey]: proprietarioContratoId, cliente_id: clienteSelecionadoId, descricao: `Contrato: ${tituloDocumento}`,
            valor_total: vTotal, data_emissao: format(new Date(), 'yyyy-MM-dd'), data_vencimento: parcelas[0].data_vencimento,
            tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente', status: 'aberta', origem: 'contrato',
            contrato_gerado_id: newC.id, id_conta_patrimonial: contaPatrimonialId, id_conta_resultado: contaReceitaId,
        }).select('id').single();

        await supabase.from(tP).insert(parcelas.map(p => ({ ...p, conta_receber_id: newCS.id, [ownerKey]: proprietarioContratoId, id_conta_contabil: contaParcelaId })));

        if (temConfig && status !== 'rascunho') {
            const idAtivo = uuidv4(); const idRec = uuidv4();
            const dISO = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
            const desc = `Contrato: ${tituloDocumento} (CR ID: ${newCS.id.substring(0,8)})`;
            await supabase.from('lancamentos').insert([
                { id: idAtivo, proprietario_id: proprietarioContratoId, data_movimentacao: dISO, descricao: `Lançamento Inicial CR: ${desc}`, valor: vTotal, tipo: 'Entrada', conta_contabil_id: contaPatrimonialId, origem: 'lancamento_cr', conta_resultado_id: idRec },
                { id: idRec, proprietario_id: proprietarioContratoId, data_movimentacao: dISO, descricao: `Receita: ${desc}`, valor: vTotal, tipo: 'Saida', conta_contabil_id: contaReceitaId, origem: 'lancamento_cr', conta_resultado_id: idAtivo }
            ]);
        }
        showSuccess('Contrato gerado com sucesso!');
        navigate('/contratos');
    } catch (e: any) { showError(e.message); } finally { setIsSubmitting(false); }
  };

  const manualTags = useMemo(() => {
      const allTags = [...TAGS_PADRAO, ...tagsCustomizadas];
      return allTags.filter(t => !t.nome_tag.startsWith('{{CLIENTE_') && !t.nome_tag.startsWith('{{EMPRESA_') && !['{{VALOR_TOTAL_CONTRATO}}', '{{VALOR_PARCELA}}', '{{NUMERO_PARCELAS}}', '{{PRIMEIRO_VENCIMENTO}}', '{{DATA_EMISSAO}}'].includes(t.nome_tag)).map(t => t.nome_tag);
  }, [tagsCustomizadas]);

  if (carregandoSessao || carregandoDados || carregandoCapital) {
    return <LayoutPrincipal><div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6 w-full">
        <Button onClick={() => navigate('/contratos')} variant="link" className="text-muted-foreground p-0 h-auto mr-4">
            <ChevronLeft className="w-5 h-5" /> Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar' : 'Preencher'} Contrato
        </h1>
      </div>
      
      {!temCapitalSocial && <Alert variant="destructive" className="mb-6"><AlertTriangle className="h-4 w-4" /><AlertTitle>Atenção</AlertTitle><AlertDescription>Registre o Capital Social para ativar o financeiro deste contrato.</AlertDescription></Alert>}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Button onClick={handlePreview} variant="outline" className="flex-1 h-12" disabled={!clienteSelecionadoId}><Eye className="mr-2 h-4 w-4" /> Pré-visualizar</Button>
          <Button onClick={() => handleSalvarContrato('pendente_assinatura')} className="flex-1 h-12" disabled={isSubmitting || !clienteSelecionadoId}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {isEditing ? 'Salvar Alterações' : 'Gerar para Assinatura'}</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader><CardTitle className="text-xl">1. Dados e Tags</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {isAdmin && (
                <div className="space-y-2"><Label>Proprietário do Contrato</Label>
                    <Select value={proprietarioContratoId || ''} onValueChange={setProprietarioContratoId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{empresasContrato.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select>
                </div>
            )}
            <div className="space-y-4">
                <div className="space-y-2"><Label>Título</Label><Input value={tituloDocumento} onChange={e => setTituloDocumento(e.target.value)} /></div>
                <div className="space-y-2"><Label>Cliente</Label>
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId} disabled={!proprietarioContratoId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{clientesCR.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select>
                </div>
            </div>
            <Separator />
            <div className="space-y-4">
                <h3 className="font-semibold">Tags Manuais</h3>
                {manualTags.map(tag => (
                    <div key={tag} className="space-y-1"><Label className="text-xs font-semibold">{tag}</Label><Input value={valoresTags[tag] || ''} onChange={e => handleTagChange(tag, e.target.value)} /></div>
                ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
            <Card>
                <CardHeader><CardTitle className="text-xl">2. Financeiro</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <RadioGroup value={tipoLancamento} onValueChange={v => setTipoLancamento(v as TipoLancamento)} className="flex space-x-4">
                        <div className="flex items-center space-x-2"><RadioGroupItem value="unico" id="u" /><Label htmlFor="u">Único</Label></div>
                        <div className="flex items-center space-x-2"><RadioGroupItem value="repetir" id="r" /><Label htmlFor="r">Repetir</Label></div>
                        <div className="flex items-center space-x-2"><RadioGroupItem value="parcelar" id="p" /><Label htmlFor="p">Parcelar</Label></div>
                    </RadioGroup>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2"><Label>Valor</Label><Input type="number" step="0.01" value={valorTotal} onChange={e => setValorTotal(parseFloat(e.target.value) || 0)} /></div>
                        {tipoLancamento === 'unico' ? (
                            <div className="space-y-2 md:col-span-2"><Label>Vencimento</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full text-left">{dataVencimentoUnico ? format(dataVencimentoUnico, "dd/MM/yyyy") : 'Data'}</Button></PopoverTrigger><PopoverContent className="p-0"><Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} locale={ptBR} /></PopoverContent></Popover></div>
                        ) : (
                            <>
                                <div className="space-y-2"><Label>Nº Parcelas</Label><Input type="number" value={numeroParcelas} onChange={e => setNumeroParcelas(parseInt(e.target.value) || 1)} /></div>
                                <div className="space-y-2"><Label>1º Venc.</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full text-left">{dataPrimeiroVencimento ? format(dataPrimeiroVencimento, "dd/MM/yyyy") : 'Data'}</Button></PopoverTrigger><PopoverContent className="p-0"><Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} locale={ptBR} /></PopoverContent></Popover></div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
            <Card><CardHeader><CardTitle className="text-xl">3. Prévia do Contrato</CardTitle></CardHeader><CardContent><div className="border rounded-md p-4 bg-background max-h-[500px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: renderConteudo() || 'Preencha os dados para ver a prévia.' }} /></CardContent></Card>
        </div>
      </div>

      <ContratoPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} conteudoHtml={renderConteudo()} titulo={tituloDocumento || modelo?.titulo || 'Contrato'} isHtml={true} />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;