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
import { ClienteProfile, AdminProfile } from '@/types/usuario';
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
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number>(0); 
  const [tituloDocumento, setTituloDocumento] = useState('');
  
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<any[]>([]);
  
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(undefined);
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(undefined);
  const [intervaloDias, setIntervaloDias] = useState<number>(30);

  const isEditing = !!contratoId;

  const ownerIdLogado = useMemo(() => {
    if (carregandoSessao) return null;
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as any)?.admin_id || (perfil as any)?.cliente_id || null;
    return null;
  }, [carregandoSessao, isAdmin, isCliente, role, usuario, perfil]);

  const fetchDependentData = useCallback(async (targetId: string) => {
    if (!targetId) return;
    const [tagsRes, clientesRes] = await Promise.all([
      supabase.from('contrato_tags').select('*').eq('empresa_id', targetId),
      supabase.from('clientes').select('*').eq('proprietario_id', targetId).order('nome')
    ]);
    if (tagsRes.data) setTagsCustomizadas(tagsRes.data);
    if (clientesRes.data) setClientesCR(clientesRes.data);
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
      const { data } = await supabase.from('tbl_clientes').select('id, nome').eq('aprovado', true);
      setEmpresasContrato([{ id: ownerIdLogado, nome: 'Meus Contratos' }, ...(data || [])]);
    }
    setProprietarioContratoId(ownerIdLogado);
    await fetchDependentData(ownerIdLogado!);
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, isAdmin, fetchDependentData]);

  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) buscarDados();
  }, [carregandoSessao, ownerIdLogado, buscarDados]);

  const tagsParaPreenchimentoManual = useMemo(() => {
    const padrao = TAGS_PADRAO.map(t => t.nome_tag);
    return tagsCustomizadas.map(t => t.nome_tag).filter(t => !padrao.includes(t));
  }, [tagsCustomizadas]);

  const renderConteudo = () => {
    let html = modelo?.conteudo_template || '';
    Object.keys(valoresTags).forEach(tag => {
      html = html.replace(new RegExp(tag, 'g'), valoresTags[tag] || tag);
    });
    return html;
  };

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Button onClick={() => navigate('/contratos')} variant="link" className="p-0 mr-4"><ChevronLeft /> Voltar</Button>
        <h1 className="text-2xl font-bold flex items-center"><FileSignature className="mr-2"/> {isEditing ? 'Editar' : 'Iniciar'} Contrato</h1>
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
                  <SelectContent>{clientesCR.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. Detalhes Financeiros</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Total (R$)</Label>
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
                        {dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy') : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} /></PopoverContent>
                  </Popover>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label>Parcelas</Label>
                    <Input type="number" value={numeroParcelas} onChange={e => setNumeroParcelas(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Intervalo</Label>
                    <Input type="number" value={intervaloDias} onChange={e => setIntervaloDias(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>1º Vencimento</Label>
                    <Input type="date" onChange={e => setDataPrimeiroVencimento(new Date(e.target.value))} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Tags Manuais</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Preencha as tags que não foram automáticas.</p>
              {tagsParaPreenchimentoManual.map(tag => (
                <div key={tag} className="space-y-1">
                  <Label className="text-xs">{tag}</Label>
                  <Input placeholder={`Valor para ${tag}`} onChange={e => setValoresTags(prev => ({...prev, [tag]: e.target.value}))} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit sticky top-6">
          <CardHeader><CardTitle className="flex justify-between">Prévia <Eye className="h-4 w-4"/></CardTitle></CardHeader>
          <CardContent>
            <div className="border p-6 rounded bg-slate-50 min-h-[500px] text-sm leading-relaxed" 
                 dangerouslySetInnerHTML={{ __html: renderConteudo() }} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end space-x-4">
        <Button variant="outline" onClick={() => navigate('/contratos')}>Cancelar</Button>
        <Button variant="secondary" onClick={() => console.log("Salvar Rascunho")}><Save className="mr-2 h-4 w-4"/> Rascunho</Button>
        <Button onClick={() => console.log("Gerar")}>Gerar e Enviar</Button>
      </div>
    </LayoutPrincipal>
  );
};

export default PreencherContrato;