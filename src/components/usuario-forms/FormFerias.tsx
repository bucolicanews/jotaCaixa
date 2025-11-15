import React, { useMemo } from 'react';
import GerenciarFerias from '@/components/formularios/GerenciarFerias';
import GerenciarFeriasAdmin from '@/components/formularios/GerenciarFeriasAdmin';
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFeriasCLT } from '@/hooks/use-ferias-clt';
import { format, parseISO, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CalendarCheck, Clock, AlertTriangle, Scale, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

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
      periodos, // NEW: Array of all periods
      periodoAtual, // NEW: The currently running period
      ultimaFeriasFim,
      diasDeFeriasDireito,
      faltasInjustificadasAcumuladas,
      carregando: carregandoCLT,
  } = useFeriasCLT(
      usuarioInicial.id,
      dataInicioContrato,
      new Date(), 
      [] 
  );

  if (!proprietarioId) {
      return (
          <Card><CardContent className="p-6">O perfil do funcionário não está vinculado a uma empresa/admin.</CardContent></Card>
      );
  }
  
  if (carregandoCLT) {
      return (
          <div className="flex justify-center items-center h-20">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
      );
  }
  
  const ultimaFeriasDisplay = ultimaFeriasFim 
    ? format(ultimaFeriasFim, 'dd/MM/yyyy', { locale: ptBR }) 
    : 'Nenhuma férias gozada registrada.';
    
  const proximoAquisitivoInicio = periodoAtual?.inicio_aquisitivo 
    ? format(periodoAtual.inicio_aquisitivo, 'dd/MM/yyyy', { locale: ptBR }) 
    : 'N/A';
    
  const proximoAquisitivoFim = periodoAtual?.fim_aquisitivo 
    ? format(periodoAtual.fim_aquisitivo, 'dd/MM/yyyy', { locale: ptBR }) 
    : 'N/A';
    
  const limiteConcessivo = periodoAtual?.limite_concessivo 
    ? format(periodoAtual.limite_concessivo, 'dd/MM/yyyy', { locale: ptBR }) 
    : 'N/A';
    
  const isVencidoEmDobro = periodoAtual?.status === 'Vencida em Dobro';
  
  // Calcula o período aquisitivo anterior para exibição (apenas se estiver vencido em dobro)
  const periodoAquisitivoAnterior = useMemo(() => {
      if (!isVencidoEmDobro || !periodoAtual?.inicio_aquisitivo) return null;
      
      const inicio = subYears(periodoAtual.inicio_aquisitivo, 1);
      const fim = subYears(periodoAtual.fim_aquisitivo, 1);
      
      return {
          inicio: format(inicio, 'dd/MM/yyyy'),
          fim: format(fim, 'dd/MM/yyyy'),
      };
  }, [isVencidoEmDobro, periodoAtual]);
  
  const getStatusBadge = (status: string) => {
      switch (status) {
          case 'Vencida em Dobro': return <Badge variant="destructive">Vencida em Dobro</Badge>;
          case 'Em Aberto': return <Badge variant="warning">Em Aberto</Badge>;
          case 'Gozada': return <Badge variant="success">Gozada</Badge>;
          case 'Em Andamento': return <Badge variant="secondary">Em Andamento</Badge>;
          default: return <Badge variant="outline">{status}</Badge>;
      }
  };


  return (
    <div className="space-y-6">
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><Clock className="w-5 h-5 mr-2" /> Cálculo CLT de Férias</CardTitle></CardHeader>
            <CardContent>
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
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Período Aquisitivo Atual</p>
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
                        <div className={cn("p-3 rounded-md md:col-span-2", periodoAtual?.status === 'Em Aberto' ? 'bg-yellow-100 dark:bg-yellow-900/20' : 'bg-secondary')}>
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
            </CardContent>
        </Card>
        
        {/* NOVO: TABELA DE PERÍODOS AQUISITIVOS */}
        <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><ListChecks className="w-5 h-5 mr-2" /> Histórico de Períodos Aquisitivos</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Período Aquisitivo</TableHead>
                                <TableHead>Limite Concessivo</TableHead>
                                <TableHead className="text-center">Faltas</TableHead>
                                <TableHead className="text-center">Dias Direito</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {periodos.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center">Nenhum período aquisitivo encontrado.</TableCell></TableRow>
                            ) : (
                                periodos.map((p, index) => (
                                    <TableRow key={index} className={cn(p.status === 'Vencida em Dobro' && 'bg-red-500/10')}>
                                        <TableCell className="font-medium">
                                            {format(p.inicio_aquisitivo, 'dd/MM/yyyy')} - {format(p.fim_aquisitivo, 'dd/MM/yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            {format(p.limite_concessivo, 'dd/MM/yyyy')}
                                        </TableCell>
                                        <TableCell className="text-center text-red-600 font-semibold">
                                            {p.faltas_injustificadas}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {p.dias_direito}
                                        </TableCell>
                                        <TableCell>
                                            {getStatusBadge(p.status)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
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