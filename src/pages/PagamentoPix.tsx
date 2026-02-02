import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Check, QrCode as QrCodeIcon, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface ParcelaData {
  valor_parcela: number;
  data_vencimento: string;
  pagbank_qr_code: string | null;
  pagbank_qr_code_text: string | null;
  pagbank_status: string | null;
  pagbank_link_expira_em: string | null;
  pagbank_checkout_link: string | null;
  conta_receber_id?: string | null;
  admin_contas_receber?: {
    descricao: string;
  } | null;
}

export default function PagamentoPix() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedCheckout, setCopiedCheckout] = useState(false);
  const [parcela, setParcela] = useState<ParcelaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (id) buscarParcela();
  }, [id]);
  
  const buscarParcela = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[PagamentoPix] Buscando parcela ID:', id);
      console.log('[PagamentoPix] Tipo do ID:', typeof id);
      console.log('[PagamentoPix] Supabase URL:', supabase.supabaseUrl);
      
      // BUSCA SIMPLIFICADA: Buscar apenas os campos da parcela (sem JOIN)
      const { data, error: fetchError, count } = await supabase
        .from('admin_parcelas_receber')
        .select(`
          valor_parcela,
          data_vencimento,
          pagbank_qr_code,
          pagbank_qr_code_text,
          pagbank_status,
          pagbank_link_expira_em,
          pagbank_checkout_link,
          conta_receber_id
        `, { count: 'exact' })
        .eq('id', id)
        .maybeSingle();
      
      console.log('[PagamentoPix] Resultado da query:', { data, fetchError, count });
      console.log('[PagamentoPix] Data é null?', data === null);
      console.log('[PagamentoPix] Tem erro?', !!fetchError);
      
      if (fetchError) {
        console.error('[PagamentoPix] Erro ao buscar:', fetchError);
        setError('Erro ao buscar cobrança: ' + fetchError.message);
        return;
      }
      
      if (!data) {
        console.error('[PagamentoPix] Nenhum dado retornado');
        setError('Cobrança não encontrada');
        return;
      }
      
      console.log('[PagamentoPix] Parcela encontrada:', {
        id,
        tem_qr_code: !!data.pagbank_qr_code,
        tem_qr_code_text: !!data.pagbank_qr_code_text,
        status: data.pagbank_status,
        link_expira_em: data.pagbank_link_expira_em
      });
      
      // NÃO BLOQUEAR se não tem QR Code - deixar a página decidir o que mostrar
      // A validação de expiração e status será feita mais abaixo
      
      // Buscar descrição da conta (opcional, não bloqueia se falhar)
      let parcelaCompleta: ParcelaData = {
        valor_parcela: data.valor_parcela,
        data_vencimento: data.data_vencimento,
        pagbank_qr_code: data.pagbank_qr_code,
        pagbank_qr_code_text: data.pagbank_qr_code_text,
        pagbank_status: data.pagbank_status,
        pagbank_link_expira_em: data.pagbank_link_expira_em,
        pagbank_checkout_link: data.pagbank_checkout_link,
        conta_receber_id: data.conta_receber_id,
        admin_contas_receber: null
      };
      
      if (data.conta_receber_id) {
        const { data: conta } = await supabase
          .from('admin_contas_receber')
          .select('descricao')
          .eq('id', data.conta_receber_id)
          .maybeSingle();
        
        if (conta) {
          parcelaCompleta.admin_contas_receber = { descricao: conta.descricao };
        }
      }
      
      setParcela(parcelaCompleta);
    } catch (err: any) {
      console.error('[PagamentoPix] Exceção:', err);
      setError(err.message || 'Erro ao buscar cobrança');
    } finally {
      setLoading(false);
    }
  };
  
  const copiarCodigo = async () => {
    if (!parcela?.pagbank_qr_code_text) return;
    
    try {
      await navigator.clipboard.writeText(parcela.pagbank_qr_code_text);
      setCopied(true);
      toast.success('Código PIX copiado!', {
        description: 'Cole no app do seu banco para pagar'
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Erro ao copiar código');
    }
  };
  
  const copiarLinkCheckout = async () => {
    if (!parcela?.pagbank_checkout_link) return;
    
    try {
      await navigator.clipboard.writeText(parcela.pagbank_checkout_link);
      setCopiedCheckout(true);
      toast.success('Link de Checkout copiado!', {
        description: 'Cole para compartilhar ou abrir em outra aba'
      });
      setTimeout(() => setCopiedCheckout(false), 2000);
    } catch (err) {
      toast.error('Erro ao copiar link');
    }
  };
  
  const isExpired = () => {
    if (!parcela?.pagbank_link_expira_em) return false;
    return new Date(parcela.pagbank_link_expira_em) < new Date();
  };
  
  const isPaid = () => {
    return parcela?.pagbank_status === 'PAID';
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-green-600 mx-auto" />
          <p className="text-gray-600">Carregando informações...</p>
        </Card>
      </div>
    );
  }
  
  if (error || !parcela) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto" />
          <h1 className="text-2xl font-bold text-red-700">Erro</h1>
          <p className="text-gray-600">{error || 'Cobrança não encontrada'}</p>
          <Button onClick={() => navigate('/')} variant="outline">
            Voltar ao início
          </Button>
        </Card>
      </div>
    );
  }
  
  if (isPaid()) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
          <h1 className="text-2xl font-bold text-green-700">Pagamento Confirmado!</h1>
          <p className="text-gray-600">Esta cobrança já foi paga.</p>
          <div className="text-sm text-gray-500 pt-4 border-t">
            <p className="font-semibold">Valor pago:</p>
            <p className="text-2xl font-bold text-green-600">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcela.valor_parcela)}
            </p>
          </div>
        </Card>
      </div>
    );
  }
  
  // Se não tem PIX mas tem checkout, mostrar checkout
  if ((!parcela.pagbank_qr_code || !parcela.pagbank_qr_code_text) && parcela.pagbank_checkout_link) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 space-y-6 shadow-lg">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-purple-700">Pagamento Disponível</h1>
            {parcela.admin_contas_receber?.descricao && (
              <p className="text-sm text-gray-600">{parcela.admin_contas_receber.descricao}</p>
            )}
          </div>
          
          <div className="space-y-3 text-center bg-purple-50 p-4 rounded-lg border border-purple-200">
            <p className="text-sm font-semibold text-gray-700">Valor a pagar:</p>
            <p className="text-4xl font-bold text-purple-600">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcela.valor_parcela)}
            </p>
          </div>
          
          <div className="space-y-3">
            <p className="text-sm text-gray-600 text-center">Link de Pagamento:</p>
            <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
              <p className="break-all text-xs font-mono text-gray-700">
                {parcela.pagbank_checkout_link}
              </p>
            </div>
            
            <Button 
              onClick={() => window.open(parcela.pagbank_checkout_link!, '_blank')}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 text-lg font-semibold"
              size="lg"
            >
              Abrir Link de Pagamento
            </Button>
          </div>
          
          <div className="text-xs text-center text-gray-500 pt-4 border-t">
            <p>Pagamento 100% seguro via PagBank</p>
          </div>
        </Card>
      </div>
    );
  }
  
  // Se não tem PIX E não tem checkout, mostrar erro
  if (!parcela.pagbank_qr_code || !parcela.pagbank_qr_code_text) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-600 mx-auto" />
          <h1 className="text-2xl font-bold text-amber-700">PIX não gerado</h1>
          <p className="text-gray-600">O PIX ainda não foi gerado para esta cobrança.</p>
          <p className="text-sm text-gray-500">Entre em contato para gerar o código PIX.</p>
        </Card>
      </div>
    );
  }
  
  if (isExpired()) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-600 mx-auto" />
          <h1 className="text-2xl font-bold text-amber-700">PIX Expirado</h1>
          <p className="text-gray-600">O prazo para pagamento deste PIX já expirou.</p>
          <p className="text-sm text-gray-500">Entre em contato para gerar um novo código.</p>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white p-4 py-8">
      <Card className="max-w-md mx-auto p-6 space-y-6 shadow-lg">
        <div className="text-center space-y-2">
          <QrCodeIcon className="w-12 h-12 text-green-600 mx-auto" />
          <h1 className="text-2xl font-bold text-green-700">Pagamento PIX</h1>
          {parcela.admin_contas_receber?.descricao && (
            <p className="text-sm text-gray-600">{parcela.admin_contas_receber.descricao}</p>
          )}
        </div>
        
        {parcela.pagbank_qr_code && (
          <div className="flex justify-center py-4">
            <div className="bg-white p-4 rounded-lg border-4 border-green-500 shadow-md">
              <img 
                src={parcela.pagbank_qr_code} 
                alt="QR Code PIX"
                className="w-64 h-64 object-contain"
              />
            </div>
          </div>
        )}
        
        <div className="space-y-3 text-center bg-green-50 p-4 rounded-lg border border-green-200">
          <p className="text-sm font-semibold text-gray-700">Valor a pagar:</p>
          <p className="text-4xl font-bold text-green-600">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcela.valor_parcela)}
          </p>
          <p className="text-sm text-gray-600">
            Vencimento: {new Date(parcela.data_vencimento).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
            })}
          </p>
          {parcela.pagbank_link_expira_em && (
            <p className="text-xs text-amber-600 font-semibold">
              PIX válido até: {new Date(parcela.pagbank_link_expira_em).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          )}
        </div>
        
        {parcela.pagbank_qr_code_text && (
          <>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Código PIX (Copia e Cola):</p>
              <div className="bg-gray-100 p-3 rounded-lg border border-gray-300 max-h-24 overflow-y-auto">
                <p className="break-all text-xs font-mono text-gray-700">
                  {parcela.pagbank_qr_code_text}
                </p>
              </div>
            </div>
            
            <Button 
              onClick={copiarCodigo}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-6 text-lg font-semibold"
              size="lg"
            >
              {copied ? (
                <>
                  <Check className="mr-2 w-5 h-5" /> Copiado!
                </>
              ) : (
                <>
                  <Copy className="mr-2 w-5 h-5" /> Copiar Código PIX
                </>
              )}
            </Button>
          </>
        )}
        
        <Alert className="bg-blue-50 border-blue-200">
          <AlertDescription className="text-sm text-gray-700">
            <p className="font-semibold mb-2">📱 Como pagar:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-sm">
              <li>Clique em "Copiar Código PIX"</li>
              <li>Abra o app do seu banco</li>
              <li>Escolha PIX → Copia e Cola</li>
              <li>Cole o código e confirme o pagamento</li>
            </ol>
          </AlertDescription>
        </Alert>
        
        {parcela.pagbank_checkout_link && (
          <div className="space-y-3 pt-4 border-t">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-purple-700">Link de Checkout</h2>
              <p className="text-sm text-gray-600">Ou pague com outras opções (PIX, Boleto, Cartão)</p>
            </div>
            
            <div className="bg-purple-50 p-3 rounded-lg border border-purple-300 max-h-20 overflow-y-auto">
              <p className="break-all text-xs font-mono text-gray-700">
                {parcela.pagbank_checkout_link}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={copiarLinkCheckout}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                size="lg"
              >
                {copiedCheckout ? (
                  <>
                    <Check className="mr-2 w-4 h-4" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 w-4 h-4" /> Copiar Link
                  </>
                )}
              </Button>
              
              <Button 
                onClick={() => window.open(parcela.pagbank_checkout_link!, '_blank')}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                size="lg"
              >
                Abrir Checkout
              </Button>
            </div>
          </div>
        )}
        
        <div className="text-xs text-center text-gray-500 pt-4 border-t">
          <p>Pagamento 100% seguro via PagBank</p>
        </div>
      </Card>
    </div>
  );
}
