import React, { useMemo } from 'react';
import GerenciarFerias from '@/components/formularios/GerenciarFerias';
import GerenciarFeriasAdmin from '@/components/formularios/GerenciarFeriasAdmin';
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFeriasCLT } from '@/hooks/use-ferias-clt';
import { format, parseISO, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CalendarCheck, Clock, AlertTriangle, Scale } from 'lucide-react';
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
  
  const {
      periodoAquisitivo,
      ultimaFeriasFim,
      diasDeFeriasDireito,
      faltasInjustificadasAcumuladas,
      carregando: carregandoCLT,
  } = useFeriasCLT(
      usuarioInicial.id,
      dataInicioContrato,
      new Date(), // Mês de referência atual
      [] // Array vazio para registros
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
    
  const isVencidoEmDobro = periodoAquisitivo?.isVencidoEmDobro ?? false;
  
  // Calcula o período aquisitivo anterior para exibição (apenas se estiver vencido em dobro)
  const periodoAquisitivoAnterior = useMemo(() => {
      if (!isVencidoEmDobro || !periodoAquisitivo?.data_inicio_aquisitivo) return null;
      
      const inicio = subYears(periodoAquisitivo.data_inicio_aquisitivo, 1);
      const fim = subYears(periodoAquisitivo.data_fim_aquisitivo, 1);
      
      return {
          inicio: format(inicio, 'dd/MM/yyyy'),
          fim: format(fim, 'dd/MM/yyyy'),
      };
  }, [isVencidoEmDobro, periodoAquisitivo]);


  return (
    <div className="space-y-6">
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><Clock className="w-5 h-5 mr-2" /> Cálculo CLT de Férias</CardTitle></CardHeader>
            <CardContent>
                {carregandoCLT ? (
                    <div className="flex justify-center items-center h-20"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : (
                    <div className="space-y-4">
                        
                        {/* ALERTA DE DOBRA DE FÉRIAS */}
                        {isVencidoEmDobro && periodoAquisitivoAnterior && (
                            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md flex items-center space-x-3">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
                                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                                    DOBRA DE FÉRIAS: O período aquisitivo de <span className="font-bold">{periodoAquisitivoAnterior.inicio} a {periodoAquisitivoAnterior.fim}</span> venceu em dobro.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="p-3 bg-secondary rounded-md">
                                <p className="text-sm font-medium text-muted-foreground flex items-center"><CalendarCheck className="w-4 h-4 mr-2" /> Início do Contrato</p>
                                <p className="text-lg font-bold mt-1">{dataInicioContrato ? format(parseISO(dataInicioContrato), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}</p>
                            </div>
                            <div className="p-3 bg-secondary rounded-md">
                                <p className="text-sm font-medium text-muted-foreground flex items-center"><CalendarCheck className="w-4 h-4 mr-2" /> Última Férias Gozada</p>
                                <p className="text-lg font-bold mt-1">{ultimaFeriasDisplay}</p>
                            </div>
                            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-md">
                                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Período Aquisitivo</p>
                                <p className="text-sm font-bold mt-1">{proximoAquisitivoInicio} a {proximoAquisitivoFim}</p>
                            </div>
                            <div className={cn("p-3 rounded-md", isVencidoEmDobro ? 'bg-red-500/20' : 'bg-green-100 dark:bg-green-900/20')}>
                                <p className="text-sm font-medium text-foreground flex items-center">
                                    <Scale className="w-4 h-4 mr-2" /> Dias de Direito
                                </p>
                                <p className={cn("text-2xl font-bold mt-1", isVencidoEmDobro ? 'text-red-600' : 'text-green-600')}>
                                    {diasDeFeriasDireito} dias
                                </p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className={cn("p-3 rounded-md md:col-span-2", periodoAquisitivo?.status === 'Concessivo Aberto' ? 'bg-yellow-100 dark:bg-yellow-900/20' : 'bg-secondary')}>
                                <p className="text-sm font-medium text-foreground flex items-center">
                                    <AlertTriangle className="w-4 h-4 mr-2" /> Limite Concessivo
                                </p>
                                <p className="text-lg font-bold mt-1">{limiteConcessivo}</p>
                            </div>
                            <div className="p-3 bg-secondary rounded-md md:col-span-1">
                                <p className="text-sm font-medium text-muted-foreground">Faltas Injustificadas</p>
                                <p className="text-lg font-bold mt-1 text-red-600">{faltasInjustificadasAcumuladas}</p>
                            </div>
                        </div>
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