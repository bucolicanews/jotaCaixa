import React from 'react';
import GerenciarFerias from '@/components/formularios/GerenciarFerias';
import GerenciarFeriasAdmin from '@/components/formularios/GerenciarFeriasAdmin';
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFeriasCLT } from '@/hooks/use-ferias-clt';
import { format, parseISO } from 'date-fns'; // Adicionado parseISO
import { ptBR } from 'date-fns/locale';
import { Loader2, CalendarCheck, Clock, AlertTriangle } from 'lucide-react';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';

interface FormFeriasProps {
  usuarioInicial: UsuarioProfile | AdminUsuarioProfile | null;
}

const FormFerias: React.FC<FormFeriasProps> = ({ usuarioInicial }) => {
  
  if (!usuarioInicial) {
      return (
          <Card><CardContent className="p-6">As configurações de férias estarão disponíveis após a criação do usuário.</CardContent></Card>
      );
  }
  
  // Determina se o usuário é um funcionário do Admin (tem admin_id e não cliente_id)
  const isUserOfAdmin = 'admin_id' in usuarioInicial && !!usuarioInicial.admin_id;
  
  // O ID do proprietário é o ID do Cliente ou Admin
  const proprietarioId = isUserOfAdmin 
    ? (usuarioInicial as AdminUsuarioProfile).admin_id 
    : (usuarioInicial as UsuarioProfile).cliente_id;
    
  // Dados necessários para o hook CLT
  const dataInicioContrato = usuarioInicial.data_inicio_contrato;
  
  // NOTA: O hook useFeriasCLT precisa de todos os registros de ponto para calcular as faltas.
  // Como estamos no formulário de edição, não temos acesso fácil a todos os registros.
  // Para fins de demonstração do cálculo, passaremos um array vazio para os registros,
  // mas o cálculo de faltas acumuladas será impreciso aqui.
  // Em um cenário real, o componente pai (GerenciarUsuarios) precisaria fornecer todos os registros.
  const {
      periodoAquisitivo,
      ultimaFeriasFim,
      diasDeFeriasDireito,
      faltasInjustificadasAcumuladas,
      carregando: carregandoCLT,
      // refetch: refetchCLT, // Removido
  } = useFeriasCLT(
      usuarioInicial.id,
      dataInicioContrato,
      new Date(), // Mês de referência atual
      [] // Array vazio para registros (para evitar erro de dependência circular)
  );

  if (!proprietarioId) {
      return (
          <Card><CardContent className="p-6">O perfil do funcionário não está vinculado a uma empresa/admin.</CardContent></Card>
      );
  }
  
  const ultimaFeriasDisplay = ultimaFeriasFim 
    ? format(ultimaFeriasFim, 'dd/MM/yyyy', { locale: ptBR }) 
    : 'Nenhuma férias gozada registrada.';
    
  const proximoAquisitivoInicio = periodoAquisitivo?.data_inicio_aquisitivo 
    ? format(periodoAquisitivo.data_inicio_aquisitivo, 'dd/MM/yyyy', { locale: ptBR }) 
    : 'N/A';
    
  const proximoAquisitivoFim = periodoAquisitivo?.data_fim_aquisitivo 
    ? format(periodoAquisitivo.data_fim_aquisitivo, 'dd/MM/yyyy', { locale: ptBR }) 
    : 'N/A';
    
  const limiteConcessivo = periodoAquisitivo?.data_limite_concessivo 
    ? format(periodoAquisitivo.data_limite_concessivo, 'dd/MM/yyyy', { locale: ptBR }) 
    : 'N/A';

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><Clock className="w-5 h-5 mr-2" /> Cálculo CLT de Férias</CardTitle></CardHeader>
            <CardContent>
                {carregandoCLT ? (
                    <div className="flex justify-center items-center h-20"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 bg-secondary rounded-md">
                                <p className="text-sm font-medium text-muted-foreground flex items-center"><CalendarCheck className="w-4 h-4 mr-2" /> Início do Contrato</p>
                                <p className="text-lg font-bold mt-1">{dataInicioContrato ? format(parseISO(dataInicioContrato), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}</p>
                            </div>
                            <div className="p-3 bg-secondary rounded-md">
                                <p className="text-sm font-medium text-muted-foreground flex items-center"><CalendarCheck className="w-4 h-4 mr-2" /> Última Férias Gozada</p>
                                <p className="text-lg font-bold mt-1">{ultimaFeriasDisplay}</p>
                            </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-md">
                                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Período Aquisitivo</p>
                                <p className="text-sm font-bold mt-1">{proximoAquisitivoInicio} a {proximoAquisitivoFim}</p>
                            </div>
                            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-md">
                                <p className="text-sm font-medium text-green-700 dark:text-green-300">Dias de Direito</p>
                                <p className="text-2xl font-bold mt-1">{diasDeFeriasDireito} dias</p>
                            </div>
                            <div className={cn("p-3 rounded-md", periodoAquisitivo?.status === 'Concessivo Aberto' ? 'bg-red-100 dark:bg-red-900/20' : 'bg-secondary')}>
                                <p className="text-sm font-medium text-foreground flex items-center">
                                    <AlertTriangle className="w-4 h-4 mr-2" /> Limite Concessivo
                                </p>
                                <p className="text-lg font-bold mt-1">{limiteConcessivo}</p>
                            </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                            Faltas Injustificadas Acumuladas no Período: <span className="font-bold text-red-600">{faltasInjustificadasAcumuladas}</span>
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader><CardTitle className="text-lg">Agendamento de Férias</CardTitle></CardHeader>
            <CardContent>
                {isUserOfAdmin ? (
                    <GerenciarFeriasAdmin
                        funcionarioId={usuarioInicial.id} 
                        adminId={proprietarioId} 
                    />
                ) : (
                    <GerenciarFerias 
                        funcionarioId={usuarioInicial.id} 
                        empresaId={proprietarioId} 
                    />
                )}
            </CardContent>
        </Card>
    </div>
  );
};

export default FormFerias;