// ... (imports)
import { useFeriasCLT } from '@/hooks/use-ferias-clt';
import { format, parseISO, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, CalendarCheck, Clock, AlertTriangle, Scale, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PeriodoAquisitivo } from '@/types/ferias'; // Importando o tipo

interface FormFeriasProps {
// ... (restante do código)

// ... (dentro do return)
                        <TableBody>
                            {periodos.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center">Nenhum período aquisitivo encontrado.</TableCell></TableRow>
                            ) : (
                                periodos.map((p: PeriodoAquisitivo, index: number) => (
                                    <TableRow key={index} className={cn(p.status === 'Vencida em Dobro' && 'bg-red-500/10')}>
                                        <TableCell className="font-medium">
                                            {/* As datas já são Date objects, não precisam de parseISO */}
                                            {format(p.inicio_aquisitivo, 'dd/MM/yyyy', { locale: ptBR })} - {format(p.fim_aquisitivo, 'dd/MM/yyyy', { locale: ptBR })}
                                        </TableCell>
                                        <TableCell>
                                            {format(p.limite_concessivo, 'dd/MM/yyyy', { locale: ptBR })}
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
// ... (restante do código)