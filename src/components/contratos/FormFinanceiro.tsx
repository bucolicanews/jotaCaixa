import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Cliente } from '@/types/cliente';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';

interface EmpresaContrato {
    id: string;
    nome: string;
}

interface FormFinanceiroProps {
    isAdmin: boolean;
    isEditing: boolean;
    proprietarioContratoId: string | null;
    setProprietarioContratoId: (id: string) => void;
    empresasContrato: EmpresaContrato[];
    clienteSelecionadoId: string;
    setClienteSelecionadoId: (id: string) => void;
    clientes: Cliente[];
    valorTotal: number;
    setValorTotal: (value: number) => void;
    tipoLancamento: TipoLancamento;
    setTipoLancamento: (type: TipoLancamento) => void;
    dataVencimentoUnico: Date | undefined;
    setDataVencimentoUnico: (date: Date | undefined) => void;
    numeroParcelas: number;
    setNumeroParcelas: (value: number) => void;
    dataPrimeiroVencimento: Date | undefined;
    setDataPrimeiroVencimento: (date: Date | undefined) => void;
    intervaloDias: number;
    setIntervaloDias: (value: number) => void;
}

const FormFinanceiro: React.FC<FormFinanceiroProps> = ({
    isAdmin,
    isEditing,
    proprietarioContratoId,
    setProprietarioContratoId,
    empresasContrato,
    clienteSelecionadoId,
    setClienteSelecionadoId,
    clientes,
    valorTotal,
    setValorTotal,
    tipoLancamento,
    setTipoLancamento,
    dataVencimentoUnico,
    setDataVencimentoUnico,
    numeroParcelas,
    setNumeroParcelas,
    dataPrimeiroVencimento,
    setDataPrimeiroVencimento,
    intervaloDias,
    setIntervaloDias,
}) => {
    const isRepetirOuParcelar = tipoLancamento !== 'unico';
    const valorLabel = tipoLancamento === 'parcelar' ? 'Valor Total a Parcelar' : 'Valor da Parcela';
    
    const handleSetDate = (days: number) => {
        const newDate = addDays(new Date(), days);
        if (tipoLancamento === 'unico') {
            setDataVencimentoUnico(newDate);
        } else {
            setDataPrimeiroVencimento(newDate);
        }
    };

    return (
        <Card className="lg:col-span-1 h-fit">
            <CardHeader><CardTitle className="text-xl">Dados Financeiros</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                
                {isAdmin && (
                    <div className="space-y-2">
                        <Label htmlFor="empresa-contrato">Empresa Proprietária do Contrato</Label>
                        <Select 
                            value={proprietarioContratoId || ''} 
                            onValueChange={setProprietarioContratoId}
                            disabled={isEditing}
                        >
                            <SelectTrigger id="empresa-contrato">
                                <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Selecione a Empresa" />
                            </SelectTrigger>
                            <SelectContent>
                                {empresasContrato.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                
                <div className="space-y-2">
                    <Label htmlFor="cliente">Cliente</Label>
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId} disabled={!proprietarioContratoId}>
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
                
                <div className="space-y-4">
                    <Label className="font-semibold">Forma de Pagamento</Label>
                    <RadioGroup 
                        value={tipoLancamento} 
                        onValueChange={(value: TipoLancamento) => setTipoLancamento(value)} 
                        className="flex space-x-4 pt-2"
                        disabled={isEditing}
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
                
                {/* Atalhos de Data */}
                <div className="flex space-x-2">
                    <Button variant="secondary" onClick={() => handleSetDate(0)} className="flex-1">Hoje</Button>
                    <Button variant="secondary" onClick={() => handleSetDate(30)} className="flex-1">30 Dias</Button>
                </div>

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
                                disabled={isEditing}
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
                                disabled={isEditing}
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
    );
};

export default FormFinanceiro;