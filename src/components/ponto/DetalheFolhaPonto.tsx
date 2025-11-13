import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, DollarSign, MapPin, Camera, FileText, AlertTriangle, Trash2, Edit, CalendarX, Plane, CalendarCheck } from 'lucide-react';
import { format, parseISO, differenceInMinutes, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useSessao } from '@/hooks/use-sessao';
import { RegistroPonto, Ferias } from '@/types/ponto';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Progress } from '../ui/progress';

interface FuncionarioDetalhe {
  id: string;
  nome: string;
  salario: number;
  horas_mensais: number;
  registros: RegistroPonto[];
  dias_folga_fixos: string[];
  folga_domingo_obrigatoria: boolean;
  ferias: Ferias[];
}

interface DetalheFolhaPontoProps {
  funcionario: FuncionarioDetalhe;
  mes: Date;
  onEditRegistro: (dia: Date) => void; // Para Ajuste de Ponto (Entrada/Saída)
  onEditFaltaAbono: (registro: RegistroPonto | null, dia: Date) => void; // Para Edição de Falta/Abono
  onDeleteRegistro: () => void; 
  onManageWorkedDayOff: (dia: Date, registros: RegistroPonto[]) => void; // NEW: Para gerenciar folga trabalhada
}

// Mapeamento de getDay() (0=Sunday, 6=Saturday) para strings
const DAY_MAP: Record<number, string> = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
};

// Constantes CLT (Simplificadas)
const JORNADA_MENSAL_PADRAO = 220; // Horas mensais padrão CLT
const JORNADA_DIARIA_PADRAO = 8; // Horas diárias padrão CLT

/**
 * Função robusta para extrair horas de uma string de observação.
 * Aceita formatos como "8h", "4", "2.5", "6,0 horas".
 */
const parseHorasObservacao = (obs?: string | null, fallback = JORNADA_DIARIA_PADRAO): number => {
    if (!obs) return fallback;
    // normaliza vírgula para ponto e remove texto irrelevante
    const normalized = obs.replace(',', '.').toLowerCase();
    // busca o primeiro número com opcional casa decimal
    const m = normalized.match(/(\d+(\.\d+)?)/);
    if (!m) return fallback;
    const valor = parseFloat(m[1]);
    if (isNaN(valor)) return fallback;
    return valor;
};


const DetalheFolhaPonto: React.FC<DetalheFolhaPontoProps> = ({ funcionario, mes, onEditRegistro, onDeleteRegistro, onManageWorkedDayOff, onEditFaltaAbono }) => {
  const { salario, horas_mensais, registros, dias_folga_fixos, folga_domingo_obrigatoria, ferias } = funcionario;
  const { role } = useSessao();
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  
  let totalMinutosTrabalhados = 0; // Horas normais (inclui abonos, sem limite)
  let totalMinutosExtras100 = 0; // Horas extras 100% (Folgas trabalhadas)
  
  // 1. Agrupamento de registros por dia (YYYY-MM-DD)
  const registrosPorDia: Record<string, RegistroPonto[]> = {};
  const registrosOrdenados = [...registros].sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
  
  for (const registro of registrosOrdenados) {
    const horario = parseISO(registro.horario_registro);
    const dia = format(horario, 'yyyy-MM-dd');
    
    if (!registrosPorDia[dia]) {
      registrosPorDia[dia] = [];
    }
    registrosPorDia[dia].push(registro);
  }
  
  // 2. Processar todos os dias do mês
  const inicioMes = startOfMonth(mes);
  const fimMes = endOfMonth(mes);
  const hoje = new Date();
  const todosOsDiasDoMes = eachDayOfInterval({ start: inicioMes, end: fimMes });
  
  const diasProcessados: Record<string, { 
    minutos: number, 
    registros: RegistroPonto[], 
    isFalta: boolean, 
    isAbono: boolean, 
    isTurnoAberto: boolean, 
    isFolgaFixa: boolean, 
    isFerias: boolean,
    hasPontoRecords: boolean,
    decisionRecord: 'Compensacao' | 'Extra100' | null,
    needsManagement: boolean,
    minutosAbonados: number, // Minutos creditados pelo abono/falta justificada
    minutosTrabalhadosFolga: number, // Minutos trabalhados na folga
    isCompensacaoAbono: boolean, // Indica se é um abono de compensação
    isFaltaJustificada: boolean, // Indica se é uma falta justificada
  }> = {};
  
  for (const data of todosOsDiasDoMes) {
    const diaString = format(data, 'yyyy-MM-dd');
    const registrosDoDia = registrosPorDia[diaString] || [];
    
    // Variáveis que precisam ser 'let' dentro do loop
    let minutosDia = 0;
    let entrada: Date | null = null;
    let isFalta = false;
    let isAbono = false;
    let minutosAbonados = 0; 
    let isTurnoAberto = false;
    let hasPontoRecords = false;
    let decisionRecord: 'Compensacao' | 'Extra100' | null = null;
    let isCompensacaoAbono = false;
    let isFaltaJustificada = false;
    
    // Lógica de Folga Fixa
    const diaDaSemana = DAY_MAP[getDay(data)];
    let isFolgaFixa = dias_folga_fixos.includes(diaDaSemana);
    if (folga_domingo_obrigatoria && diaDaSemana === 'Sunday') {
        isFolgaFixa = true;
    }
    
    // Lógica de Férias
    const isFerias = ferias.some((f: Ferias) => {
        const start = parseISO(f.data_inicio + 'T00:00:00');
        const end = parseISO(f.data_fim + 'T23:59:59');
        return isWithinInterval(data, { start, end });
    });

    // Processamento de registros de ponto (Entrada/Saída, Falta, Abono, Compensacao, Extra100)
    for (const registro of registrosDoDia) {
        if (registro.tipo === 'Falta' || registro.tipo === 'Abono') {
            if (registro.tipo === 'Falta') isFalta = true;
            if (registro.tipo === 'Abono') isAbono = true;
            
            // --- NOVO PARSING ROBUSTO ---
            const horasCreditadas = parseHorasObservacao(registro.observacao, JORNADA_DIARIA_PADRAO);
            minutosAbonados = Math.round(horasCreditadas * 60);
            // ---------------------------
            
            if (registro.observacao?.includes('Compensação de folga trabalhada')) {
                isCompensacaoAbono = true;
                minutosAbonados = 0; // Não conta horas, é um dia de folga
            } else if (isFalta && registro.atestado_url) {
                isFaltaJustificada = true;
            }
            
            // Minutos creditados para o total mensal = Minutos Abonados
            minutosDia = minutosAbonados; 
            
            // Se for Falta Injustificada, minutosDia é 0
            if (isFalta && !isFaltaJustificada) {
                minutosDia = 0;
            }
            
            // Se for Falta/Abono, ignora as batidas de ponto para o cálculo do dia
            continue;
        }
        
        if (registro.tipo === 'Compensacao') {
            decisionRecord = 'Compensacao';
        }
        if (registro.tipo === 'Extra100') {
            decisionRecord = 'Extra100';
        }
        
        if (registro.tipo === 'Entrada' || registro.<dyad-problem-report summary="3 problems">
<problem file="src/components/ponto/DetalheFolhaPonto.tsx" line="151" column="58" code="2345">Argument of type 'string | null | undefined' is not assignable to parameter of type 'string | undefined'.
  Type 'null' is not assignable to type 'string | undefined'.</problem>
<problem file="src/components/ponto/DetalheFolhaPonto.tsx" line="369" column="224" code="6133">'minutosAbonados' is declared but its value is never read.</problem>
<problem file="src/components/ponto/DetalheFolhaPonto.tsx" line="417" column="37" code="2304">Cannot find name 'displayText'.</problem>
</dyad-problem-report><think>**Fixing Type Issues**

I'm currently addressing TypeScript errors in `DetalheFolhaPonto.tsx`. Specifically, I'm focusing on fixing a TS2345 error where a null value is incorrectly assigned to a string or undefined type. I need to ensure type compatibility. This will be an important fix.


**Analyzing Null Handling**

I've examined the `parseHorasObservacao` function and confirmed its correct handling of null values. The issue seems to stem from the function's usage, specifically around `DetalheFolhaPonto.tsx:151:58`. While the function now accepts `null`, the error might lie in how it's being invoked. I'm focusing on validating the argument passed to ensure it's compatible with the updated function signature.


**Revising Type Assumptions**

I'm reconsidering the typing of `registro.observacao` based on the function's signature. I was initially focused on null handling, but now I suspect the issue lies in the implicit optional parameter. The function, after all, *should* accept null. I'm checking the broader context to ensure `registro.observacao` is defined as a union including `null` and `undefined` if optional. If not, I need to adjust either the type of the argument or how the function is used. The initial assumption about `null` needing correction is possibly incorrect.


**Clarifying Variable Usage**

I'm now focusing on resolving the TS6133 error related to the unused `minutosAbonados` variable. I identified that `minutosAbonados` is indeed calculated, but the destructuring assignment is incorrect. It's later used in the `isFalta` conditional, but is not being correctly destructured for it to be accessible, which causes the error. My current plan is to move the variable to a scope where it is clearly used.


**Refining Variable Scope**

I'm now revisiting the scope of `minutosAbonados`. The variable is used within an `if` block for display logic, which TypeScript doesn't always recognize. I'm focusing on making its usage clear and ensuring it's accessible where needed, specifically within the `isFalta` conditional. I will need to move the `horasInformadas` calculation so it is within the correct scope so as to not confuse the linter.


**Fixing Variable Scope**

I'm now revisiting the `displayText` variable. A scope issue is causing the TS2304 error. The current approach is to declare `displayText` using `let` at the beginning of the `if (isFalta)` block where it's used. This should make the variable accessible within the correct scope. The `isFalta` conditional requires this to display the correct message. I'm prioritizing this fix.


**Resolving Display Logic**

I'm working to fully resolve the display logic issues in `DetalheFolhaPonto.tsx`. The recent fixes have addressed the initial TS errors, but now I'm making certain the correct messages are displayed based on the `isFalta` conditional and the presence of associated records like `faltaRegistro` and `atestadoUrl`. The goal is complete resolution of all display issues, including edge cases and null handling, related to the `displayText` variable.


**Adjusting Display Conditions**

I'm now revising the display logic, specifically considering scenarios with and without `faltaRegistro` and `atestadoUrl`. The goal is to ensure the correct message renders in all cases related to absent records. This should resolve the remaining display inconsistencies.


**Improving Conditional Logic**

I'm now focusing on streamlining the `isFalta` conditional within the `DetalheFolhaPonto.tsx` file. I noticed that the logic for determining `minutosAbonados` is dependent on the `isFalta` condition, and now I'm working to integrate it into the variable's scope so it is always initialized. I need to make the logic for all absence scenarios clearer and more robust. My immediate focus is improving the clarity of all conditional checks and ensuring no record-types are missed.


**Optimizing Display Messages**

I'm currently revising the `displayText` variable's assignment within the `if (!atestadoUrl && observacaoFalta.includes('Falta Injustificada'))` block. Previously, it was being assigned but not always used. Now, I'm ensuring it's always assigned the appropriate value based on the absence type (partial or total). I will integrate `horasInformadas` so that it doesn't cause a future type issue. I'm focusing on consistency in how messages are built and displayed.


**Integrating Record Logic**

I'm now focusing on integrating the `minutosAbonados` calculation within the component to avoid scope issues. I've noticed an issue with the destructuring assignment, specifically within the rendering loop and I need to ensure its value is correctly accessible. Currently, I need to make the variable available when checking the display logic. I am going to make this adjustment.


**Finalizing Record Integration**

I'm now fully integrating the `minutosAbonados` calculation within the `isFalta` conditional within `DetalheFolhaPonto.tsx`. The initial problem was that `minutosAbonados` wasn't correctly set in the right environment, but that has been resolved. Now, I will focus on ensuring it is correctly assigned within its conditional. The key is in the assignment of the display logic.


**Improving Display Messages**

Now, I'm working to fully optimize the logic for displaying absence messages. I'm focusing on ensuring the display is correct regardless of whether the `atestadoUrl` is present. Previously the code would conditionally reassign `displayText`, but now I'm ensuring it's always assigned correctly depending on whether the absence is for the full day or partial, as indicated by `horasInformadas`. I'm going to integrate this with the record logic.


**Finalizing Message Display**

I'm now fully ensuring `displayText` is assigned correctly in all absence scenarios. Previously, it had redundant assignments and potential inconsistencies when `atestadoUrl` was present. I've streamlined the logic to ensure `displayText` accurately reflects full-day or partial absences, considering `horasInformadas` and the potential for a `faltaRegistro` and an `atestadoUrl`.


**Simplifying Absence Messages**

I'm currently revising the `displayText` assignment to be as straightforward as possible. I've removed the redundant conditional assignments. I've integrated checks for partial or full-day absences using `horasInformadas` and the existence of absence records. I'm focusing on ensuring accurate and concise messages. My current logic ensures that all potential absence scenarios are represented consistently in display.


**Refining Absence Display**

I'm now revising the display logic, specifically to include a check for the absence type based on whether the `horasInformadas` is populated. The goal is to ensure the absence message accurately reflects partial or full absences. The logic is now more concise, and is integrated with the variable initial assignment. All scenarios should now render correctly.


**Improving Date Formatting**

I'm currently creating a `DAY_MAP` object to correctly format days of the week as strings. Also, I'm defining standard `JORNADA_MENSAL_PADRAO` and `JORNADA_DIARIA_PADRAO` variables for CLT calculations, and finally, I am adding a function that robustly extracts hours from an observation string, handling various formats and null values.


**Calculating CLT Totals**

I'm now integrating the `totalMinutosTrabalhados` and `totalMinutosExtras100` calculations into the component's state. I'm focusing on accurately summing worked hours and extra hours from the provided `registros`, considering the `dias_folga_fixos`, `folga_domingo_obrigatoria` and `ferias` data. The goal is a clear and maintainable calculation process.


**Refining Record Processing**

I'm now revising how I process records. I'm focusing on ensuring accurate calculations for work and extra hours, taking holidays and vacation into account. I'm prioritizing building a `Record<string, ...>` to handle logic around whether the day is a holiday, and if so, what kind.


**Streamlining Record Logic**

I'm currently revising the `registrosDoDia` processing loop. I'm focusing on clarifying record types and their implications for calculations. I'm ensuring `isFolgaFixa` and `isFerias` are correctly applied to the processing of the records. I'm prioritizing accuracy.


**Enhancing Absence Handling**

I'm presently refactoring the absence processing logic within `DetalheFolhaPonto.tsx` to ensure all absence types are correctly categorized and handled. Specifically, I'm integrating the `minutosAbonados` calculation into the record processing loop to guarantee consistency and clarity in the flow. My goal is to ensure the displayed messages are accurate for all full and partial absences. I'm focusing on the logical order of conditional assignments.


**Analyzing Record Logic**

I'm now focusing on the processing of each `registro` item within the component to make all absence scenarios clearer. My priority is to correctly interpret the absence data, taking into consideration `Compensacao` and `Extra100` records in the `registrosDoDia` array. I'm ensuring the component accurately processes and displays all data. The goal is to provide a unified view of the day's events.


**Analyzing Variable Scope**

I'm now focusing on a more granular approach to calculations, specifically within `DetalheFolhaPonto.tsx`. I am ensuring that the `minutosDia` variable, which tracks daily worked minutes, is correctly initialized and updated within the `registrosDoDia` loop. This requires detailed analysis to include vacation time. My plan is to make this variable more robust. The initial assumption about hours is that it's just the difference between two inputs but it isn't.


**Analyzing Minutes Calculation**

I'm now focusing on clarifying how `minutosDia` is calculated and updated in the record processing loop.  I've noticed that absence and compensation logic directly impacts this value, particularly `minutosAbonados`. I need to review how the `minutosDia` variable is assigned based on various scenarios. The code will need to be revised.


**Improving Hour Calculations**

I'm now focusing on the hours calculation logic in `DetalheFolhaPonto.tsx`. I have refactored calculations involving `jornadaMensalMinutos` and `minutosDiferenca`. The code now accurately uses the helper functions for formatting and currency. I also added functions to handle the display of the selfie and to handle the deletion of a record. These updates are consistent, efficient, and easier to understand.


**Enhancing Deletion Handling**

I'm now focusing on improving the delete functionality for records. I'm focusing on clarifying role-based permissions and ensuring consistent error handling. The `canEdit` condition is essential. The integration of `showSuccess` and `showError` with user roles will be a priority.


**Analyzing Total Minutes**

I'm now focusing on a more granular approach to the total minutes calculation within the component, ensuring the accuracy of `totalMinutosTrabalhados`. I need to ensure that the total calculation is correct, and I'm currently looking at whether vacations and holidays are being subtracted from the total correctly. The key is in the initial assignment.


**Optimizing Total Calculation**

I'm presently refactoring the total minutes calculation for accuracy. I am currently reviewing the integration of all components. I will ensure all data is correctly integrated. The main focus is to ensure that the calculation handles all input scenarios.


**Analyzing Display Logic**

I'm now revising the display logic, including the table rows within `DetalheFolhaPonto.tsx`. The recent updates to `TableHead` and `TableRow` are now in focus. My current objective is to ensure that the correct data is displayed in each row, particularly for calculations like `totalMinutos` and `statusDisplay` values based on their `registro` items. The goal is to accurately present the working information.


**Streamlining Display Management**

I'm presently refactoring the display logic to be more modular. The goal is to separate the display details from calculations to improve clarity in `DetalheFolhaPonto.tsx`. I am now focusing on structuring the `TableHead` and `TableRow` components, ensuring that all record types (vacation, fixed days off, etc.) are properly integrated. My goal is to ensure a flexible code base.


**Enhancing Display Status**

I'm presently refactoring the display logic to incorporate more comprehensive status indicators for records within the table rows, specifically within `DetalheFolhaPonto.tsx`. I'm focusing on incorporating vacation details, holiday indicators, and other relevant information within each row. I'm focusing on including all relevant data.


**Integrating Absence Handling**

I'm now integrating the absence processing logic in `DetalheFolhaPonto.tsx`, ensuring consistent handling of partial absences through the `horasInformadas` variable. I'm focusing on incorporating this into the display logic of each record, to make the display clearer. This ensures an accurate and responsive application.


**Streamlining Absence Messages**

I'm presently refactoring the absence messages to be clearer, specifically in handling `atestadoUrl` and the absence type. The logic for constructing `displayText` is now cleaner and integrates with the new table rows. The goal is to provide a responsive and clear user interface. I'm focusing on making the logic more maintainable and easier to modify.


**Simplifying Status Display**

I'm currently revising the `statusDisplay` logic in `DetalheFolhaPonto.tsx` for cleaner presentation. Previously, the logic handled full day absences by simply checking for the absence record. Now, I'm integrating this logic for more concise messages. My primary focus is streamlining the component to use the variable properly for messages. I'm focusing on ensuring consistent status information.


**Finalizing Table Display**

I'm now integrating the `totalMinutos` calculation with the table's display, ensuring accurate data representation within `TableRow`. I'm verifying the display accuracy of key information, and making certain that records like vacations and holidays are correctly represented. I've finished the component, and all rows now render as expected.


**Finalizing Record Display**

I'm now fully integrating the `displayText` assignment with the table rows within `DetalheFolhaPonto.tsx`, ensuring consistent and accurate information for all record types and absence scenarios, including vacation, holidays, fixed days off, and the logic around the display of each record type. This includes streamlining the absence messages and ensuring that all scenarios are handled correctly. All table rows render the required information.


**Enhancing Display Status**

I'm working to correctly display the status in each table row, distinguishing between fixed days off and holidays, and ensuring the display reflects the accurate working status for each record in `DetalheFolhaPonto.tsx`. The goal is to improve the user interface.


**Optimizing Record Display**

I'm presently refactoring how each record's details are displayed in `DetalheFolhaPonto.tsx` after the initial rendering. Specifically, I'm integrating the `observacaoFalta` variable logic for displaying detailed information about absences, including their status and if an absence is justified. This adjustment ensures that all absence-related information is correctly displayed.


**Integrating Holiday Handling**

I'm now integrating the logic to display holidays and fixed days off more prominently in `DetalheFolhaPonto.tsx`. Specifically, the existing conditional logic to display vacation, holiday, fixed days off and absence is being expanded to correctly render all holiday-related details for each record type.


**Refining Record Display**

I'm currently revising the `registrosDoDia` array processing for improved clarity in `DetalheFolhaPonto.tsx`. Previously, the logic handled Entrada/Saída types separately. Now, I'm integrating the `observacaoFalta` variable logic for displaying detailed information. This ensures that the display accurately reflects the record type, status, and associated map information within the rendered table rows. All records are correctly displayed.


**Analyzing Selfie Integration**

I'm now integrating the selfie display logic directly within the `TableRow` component in `DetalheFolhaPonto.tsx` for enhanced user interaction. I'm focusing on ensuring the selfie icon and its associated click handler are correctly rendered for applicable records, specifically integrating the `<button>` element and `Camera` icon only when a `selfie_url` is present. This streamlines the display logic.


**Enhancing Record Display**

I'm focusing on improving how `registrosDoDia` array elements are rendered, clarifying record types and actions for each. The integration with `observacaoFalta` will ensure all statuses and absence details are clearly shown in the table rows. The goal is to provide a comprehensive and intuitive display.


**Enhancing Absence Messages**

I'm focusing on ensuring the display logic within the component accurately reflects the nature of absences, integrating with variables like `observacaoFalta`. The messages are being refined for clarity and consistency across all absence scenarios.


**Analyzing Absence Handling**

I'm now integrating the logic to edit `Compensacao` and `Extra100` records, but currently, it will only render if the record is a `Falta/Abono`. The goal is to accurately pass the correct data to `onEditFaltaAbono` for proper handling, with error handling for other record types. The existing code needs adjustment.


**Finalizing Absence Logic**

I'm finalizing the absence logic in the component. I'm focusing on ensuring consistent and correct record interactions and display updates across all scenarios involving `Falta`, `Abono`, `Compensacao`, and other absence-related records. Now, I need to ensure a correct and usable application of absence records, including correctly handling deletion.


**Streamlining Record Editing**

I'm presently refactoring how records are edited and displayed to improve user experience. I'm streamlining the process of marking absences, including handling the edit actions for `Falta`, `Abono`, and `Compensacao` records. The goal is to make the edit and deletion of all record types consistent and intuitive. I'm focusing on ensuring data consistency.


**Streamlining Record Editing**

I'm focusing on cleaning up the record editing and deletion process, especially within the absence scenarios. I'm now integrating logic for the full range of `Falta`, `Abono`, and `Compensacao` records, which makes it more intuitive and consistent. My focus is user friendliness.


**Enhancing UI Polish**

I'm now revising the table-based display to ensure optimal clarity. I'm prioritizing enhancements to the overall user experience within the `DetalheFolhaPonto.tsx` file. I will focus on ensuring all display elements are polished. The goal is to provide a comprehensive and intuitive experience.


**Optimizing Absence Messaging**

I'm focusing on ensuring the display logic within the component accurately reflects the absence status, particularly for full and partial absences. I'm streamlining the display and integrating these modifications with the current display logic.


</think>Os erros de compilação em `src/components/ponto/DetalheFolhaPonto.tsx` foram corrigidos.

1.  **Erro TS2345 (Argumento `null`):** A assinatura da função `parseHorasObservacao` foi ajustada para aceitar `string | null | undefined`, resolvendo o problema de tipagem.
2.  **Erro TS6133 (Variável não lida):** A variável `minutosAbonados` agora é utilizada corretamente no bloco de lógica de exibição de faltas, resolvendo o aviso.
3.  **Erro TS2304 (Variável não declarada):** A variável `displayText` foi declarada usando `let` no escopo correto (`else if (isFalta)`), resolvendo o erro.

Aqui está o arquivo corrigido:

<dyad-write path="src/components/ponto/DetalheFolhaPonto.tsx" description="Implementa parsing robusto de horas na observação e ajusta a lógica de exibição para faltas injustificadas parciais.">
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, DollarSign, MapPin, Camera, FileText, AlertTriangle, Trash2, Edit, CalendarX, Plane, CalendarCheck } from 'lucide-react';
import { format, parseISO, differenceInMinutes, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useSessao } from '@/hooks/use-sessao';
import { RegistroPonto, Ferias } from '@/types/ponto';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Progress } from '../ui/progress';

interface FuncionarioDetalhe {
  id: string;
  nome: string;
  salario: number;
  horas_mensais: number;
  registros: RegistroPonto[];
  dias_folga_fixos: string[];
  folga_domingo_obrigatoria: boolean;
  ferias: Ferias[];
}

interface DetalheFolhaPontoProps {
  funcionario: FuncionarioDetalhe;
  mes: Date;
  onEditRegistro: (dia: Date) => void; // Para Ajuste de Ponto (Entrada/Saída)
  onEditFaltaAbono: (registro: RegistroPonto | null, dia: Date) => void; // Para Edição de Falta/Abono
  onDeleteRegistro: () => void; 
  onManageWorkedDayOff: (dia: Date, registros: RegistroPonto[]) => void; // NEW: Para gerenciar folga trabalhada
}

// Mapeamento de getDay() (0=Sunday, 6=Saturday) para strings
const DAY_MAP: Record<number, string> = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
};

// Constantes CLT (Simplificadas)
const JORNADA_MENSAL_PADRAO = 220; // Horas mensais padrão CLT
const JORNADA_DIARIA_PADRAO = 8; // Horas diárias padrão CLT

/**
 * Função robusta para extrair horas de uma string de observação.
 * Aceita formatos como "8h", "4", "2.5", "6,0 horas".
 */
const parseHorasObservacao = (obs: string | null | undefined, fallback = JORNADA_DIARIA_PADRAO): number => {
    if (!obs) return fallback;
    // normaliza vírgula para ponto e remove texto irrelevante
    const normalized = obs.replace(',', '.').toLowerCase();
    // busca o primeiro número com opcional casa decimal
    const m = normalized.match(/(\d+(\.\d+)?)/);
    if (!m) return fallback;
    const valor = parseFloat(m[1]);
    if (isNaN(valor)) return fallback;
    return valor;
};


const DetalheFolhaPonto: React.FC<DetalheFolhaPontoProps> = ({ funcionario, mes, onEditRegistro, onDeleteRegistro, onManageWorkedDayOff, onEditFaltaAbono }) => {
  const { salario, horas_mensais, registros, dias_folga_fixos, folga_domingo_obrigatoria, ferias } = funcionario;
  const { role } = useSessao();
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  
  let totalMinutosTrabalhados = 0; // Horas normais (inclui abonos, sem limite)
  let totalMinutosExtras100 = 0; // Horas extras 100% (Folgas trabalhadas)
  
  // 1. Agrupamento de registros por dia (YYYY-MM-DD)
  const registrosPorDia: Record<string, RegistroPonto[]> = {};
  const registrosOrdenados = [...registros].sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
  
  for (const registro of registrosOrdenados) {
    const horario = parseISO(registro.horario_registro);
    const dia = format(horario, 'yyyy-MM-dd');
    
    if (!registrosPorDia[dia]) {
      registrosPorDia[dia] = [];
    }
    registrosPorDia[dia].push(registro);
  }
  
  // 2. Processar todos os dias do mês
  const inicioMes = startOfMonth(mes);
  const fimMes = endOfMonth(mes);
  const hoje = new Date();
  const todosOsDiasDoMes = eachDayOfInterval({ start: inicioMes, end: fimMes });
  
  const diasProcessados: Record<string, { 
    minutos: number, 
    registros: RegistroPonto[], 
    isFalta: boolean, 
    isAbono: boolean, 
    isTurnoAberto: boolean, 
    isFolgaFixa: boolean, 
    isFerias: boolean,
    hasPontoRecords: boolean,
    decisionRecord: 'Compensacao' | 'Extra100' | null,
    needsManagement: boolean,
    minutosAbonados: number, // Minutos creditados pelo abono/falta justificada
    minutosTrabalhadosFolga: number, // Minutos trabalhados na folga
    isCompensacaoAbono: boolean, // Indica se é um abono de compensação
    isFaltaJustificada: boolean, // Indica se é uma falta justificada
  }> = {};
  
  for (const data of todosOsDiasDoMes) {
    const diaString = format(data, 'yyyy-MM-dd');
    const registrosDoDia = registrosPorDia[diaString] || [];
    
    // Variáveis que precisam ser 'let' dentro do loop
    let minutosDia = 0;
    let entrada: Date | null = null;
    let isFalta = false;
    let isAbono = false;
    let minutosAbonados = 0; 
    let isTurnoAberto = false;
    let hasPontoRecords = false;
    let decisionRecord: 'Compensacao' | 'Extra100' | null = null;
    let isCompensacaoAbono = false;
    let isFaltaJustificada = false;
    
    // Lógica de Folga Fixa
    const diaDaSemana = DAY_MAP[getDay(data)];
    let isFolgaFixa = dias_folga_fixos.includes(diaDaSemana);
    if (folga_domingo_obrigatoria && diaDaSemana === 'Sunday') {
        isFolgaFixa = true;
    }
    
    // Lógica de Férias
    const isFerias = ferias.some((f: Ferias) => {
        const start = parseISO(f.data_inicio + 'T00:00:00');
        const end = parseISO(f.data_fim + 'T23:59:59');
        return isWithinInterval(data, { start, end });
    });

    // Processamento de registros de ponto (Entrada/Saída, Falta, Abono, Compensacao, Extra100)
    for (const registro of registrosDoDia) {
        if (registro.tipo === 'Falta' || registro.tipo === 'Abono') {
            if (registro.tipo === 'Falta') isFalta = true;
            if (registro.tipo === 'Abono') isAbono = true;
            
            // --- NOVO PARSING ROBUSTO ---
            const horasCreditadas = parseHorasObservacao(registro.observacao, JORNADA_DIARIA_PADRAO);
            minutosAbonados = Math.round(horasCreditadas * 60);
            // ---------------------------
            
            if (registro.observacao?.includes('Compensação de folga trabalhada')) {
                isCompensacaoAbono = true;
                minutosAbonados = 0; // Não conta horas, é um dia de folga
            } else if (isFalta && registro.atestado_url) {
                isFaltaJustificada = true;
            }
            
            // Minutos creditados para o total mensal = Minutos Abonados
            minutosDia = minutosAbonados; 
            
            // Se for Falta Injustificada, minutosDia é 0
            if (isFalta && !isFaltaJustificada) {
                minutosDia = 0;
            }
            
            // Se for Falta/Abono, ignora as batidas de ponto para o cálculo do dia
            continue;
        }
        
        if (registro.tipo === 'Compensacao') {
            decisionRecord = 'Compensacao';
        }
        if (registro.tipo === 'Extra100') {
            decisionRecord = 'Extra100';
        }
        
        if (registro.tipo === 'Entrada' || registro.tipo === 'Saida') {
            hasPontoRecords = true;
            
            const horario = parseISO(registro.horario_registro);
            
            if (registro.tipo === 'Entrada') {
                entrada = horario;
                isTurnoAberto = true;
            } else if (registro.tipo === 'Saida' && entrada) {
                // Verifica se a Saída é válida (após uma Entrada)
                const minutosTrabalhados = differenceInMinutes(horario, entrada);
                minutosDia += minutosTrabalhados;
                entrada = null;
                isTurnoAberto = false;
            } else if (registro.tipo === 'Saida' && !entrada) {
                isTurnoAberto = false;
            }
        }
    }
    
    // Se o último registro do dia foi Entrada, o turno está aberto.
    if (entrada) {
        if (isSameDay(data, hoje)) {
            minutosDia += differenceInMinutes(hoje, entrada);
            isTurnoAberto = true;
        } else {
            isTurnoAberto = true;
        }
    } else {
        isTurnoAberto = false;
    }
    
    // Armazena o tempo trabalhado/abonado do dia antes de qualquer ajuste de folga
    let minutosParaAcumular = minutosDia;
    let minutosTrabalhadosFolga = 0;
    let needsManagement = false;
    
    // --- LÓGICA DE FOLGA TRABALHADA ---
    if (isFolgaFixa && hasPontoRecords && !isFerias) {
        // Se trabalhou na folga, o tempo trabalhado é o minutosDia calculado pelas batidas
        minutosTrabalhadosFolga = minutosDia;
        
        if (!decisionRecord) {
            needsManagement = true;
            minutosParaAcumular = 0; // Não acumula no total mensal até ter decisão
        } else if (decisionRecord === 'Extra100') {
            totalMinutosExtras100 += minutosTrabalhadosFolga;
            minutosParaAcumular = 0; // Não conta como hora normal
        } else if (decisionRecord === 'Compensacao') {
            minutosParaAcumular = 0;
        }
    }
    
    // Acumular totais (apenas se não for folga trabalhada, nem abono de compensação, nem férias)
    if (!isFolgaFixa && !isFerias && !isCompensacaoAbono) {
        // Se for Falta Injustificada, minutosDia é 0, então não acumula.
        // Se for Falta Justificada ou Abono, minutosDia é o tempo creditado, então acumula.
        // Se for ponto batido, minutosDia é o tempo trabalhado, então acumula.
        totalMinutosTrabalhados += minutosParaAcumular;
    }
    
    // Se for Falta Justificada ou Abono, o total do dia é o tempo creditado
    if (isFaltaJustificada || (isAbono && !isCompensacaoAbono)) {
        minutosDia = minutosAbonados;
    } else if (isFalta && !isFaltaJustificada) {
        minutosDia = 0;
    }


    diasProcessados[diaString] = {
        minutos: minutosDia, // Minutos finais do dia (trabalhados ou creditados)
        registros: registrosDoDia,
        isFalta,
        isAbono,
        minutosAbonados, 
        isTurnoAberto,
        isFolgaFixa,
        isFerias,
        hasPontoRecords,
        decisionRecord,
        needsManagement,
        minutosTrabalhadosFolga,
        isCompensacaoAbono,
        isFaltaJustificada,
    };
  }
  
  // 3. Calcular horas extras
  const jornadaMensalMinutos = (horas_mensais || JORNADA_MENSAL_PADRAO) * 60;
  const minutosDiferenca = jornadaMensalMinutos - totalMinutosTrabalhados; 
  
  // Helper functions defined inside the component scope
  const formatarHoras = (minutos: number): string => {
    const sign = minutos < 0 ? '-' : '';
    const absMinutos = Math.abs(minutos);
    const horas = Math.floor(absMinutos / 60);
    const mins = Math.round(absMinutos % 60);
    return `${sign}${horas}h ${mins}m`;
  };
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleViewSelfie = (url: string) => {
    setSelfieUrl(url);
    setSelfieModalOpen(true);
  };
  
  const handleDelete = async (registroId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de Falta/Abono/Compensação? O dia voltará ao estado anterior.')) return;

    // Determina a tabela de destino
    const isFuncionarioAdmin = !!(funcionario as any).admin_id;
    const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';

    const { error } = await supabase
      .from(tabelaRegistros)
      .delete()
      .eq('id', registroId);

    if (error) {
      showError('Erro ao excluir registro: ' + error.message);
    } else {
      showSuccess('Registro excluído com sucesso.');
      onDeleteRegistro(); // CHAMA A FUNÇÃO DE RECARREGAMENTO
    }
  };

  const canEdit = role === 'Admin' || role === 'Cliente';
  
  // Calcula o progresso da jornada mensal
  const jornadaMensalMinutosCalc = (horas_mensais || JORNADA_MENSAL_PADRAO) * 60;
  const progressoJornada = Math.min(100, Math.round((totalMinutosTrabalhados / jornadaMensalMinutosCalc) * 100));

  // Lógica de exibição da diferença
  const isExtraHours = minutosDiferenca < 0;
  const displayDifference = formatarHoras(minutosDiferenca);
  const displayExtraHours = formatarHoras(Math.abs(minutosDiferenca));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-xl flex items-center"><DollarSign className="w-5 h-5 mr-2" /> Resumo Financeiro ({format(mes, 'MMMM/yyyy', { locale: ptBR })})</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* LINHA 1: JORNADA E SALDO */}
          <div className="col-span-2 md:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground">Salário Base</p><p className="font-bold text-lg">{formatCurrency(salario)}</p></div>
            <div><p className="text-xs text-muted-foreground">Jornada Mensal</p><p className="font-bold text-lg">{horas_mensais}h</p></div>
            <div><p className="text-xs text-muted-foreground">Horas Trabalhadas</p><p className="font-bold text-lg">{formatarHoras(totalMinutosTrabalhados)}</p></div>
            <div>
                <p className="text-xs text-muted-foreground">{isExtraHours ? 'Horas Extras' : 'Diferença (Saldo)'}</p>
                <p className={cn("font-bold text-lg", isExtraHours ? "text-green-600" : "text-red-500")}>
                    {isExtraHours ? displayExtraHours : displayDifference}
                </p>
            </div>
          </div>
          
          {/* Progresso da Jornada */}
          <div className="col-span-2 md:col-span-4 space-y-2 pt-4 border-t">
              <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">Progresso da Jornada Mensal</p>
                  <span className="font-bold text-primary">{progressoJornada}%</span>
              </div>
              <Progress value={progressoJornada} className="h-2" />
          </div>
          
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl flex items-center"><Clock className="w-5 h-5 mr-2" /> Detalhe Diário</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px] md:w-[120px]">Data</TableHead>
                  <TableHead className="hidden md:table-cell">Registros</TableHead>
                  <TableHead className="w-[100px] text-right">Total Dia</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todosOsDiasDoMes.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Nenhum dia encontrado para este mês.</TableCell></TableRow>
                ) : (
                    todosOsDiasDoMes.map(data => {
                        const diaString = format(data, 'yyyy-MM-dd');
                        const { minutos, registros, isFalta, isAbono, isTurnoAberto, isFolgaFixa, isFerias, hasPontoRecords, decisionRecord, needsManagement, minutosTrabalhadosFolga, isCompensacaoAbono, isFaltaJustificada, minutosAbonados } = diasProcessados[diaString];
                        
                        const isDiaAtual = isSameDay(data, hoje);
                        const isDiaFuturo = data > hoje;
                        
                        let statusDisplay;
                        let actionButton = null;
                        
                        // 1. Determinar Status e Ação
                        if (isFerias) {
                            statusDisplay = <span className="text-sm text-purple-600 flex items-center"><Plane className="w-4 h-4 mr-1" /> Férias</span>;
                        } else if (isFolgaFixa) {
                            if (needsManagement) {
                                statusDisplay = <span className="text-sm text-yellow-600 flex items-center font-bold"><AlertTriangle className="w-4 h-4 mr-1" /> Folga Trabalhada (Aguardando Gestão)</span>;
                                if (canEdit) {
                                    actionButton = (
                                        <Button 
                                            variant="default" 
                                            size="sm" 
                                            onClick={() => onManageWorkedDayOff(data, registros.filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida'))}
                                            title="Gerenciar Compensação"
                                            className="h-6 text-xs bg-yellow-600 hover:bg-yellow-700"
                                        >
                                            Gerenciar
                                        </Button>
                                    );
                                }
                            } else if (decisionRecord === 'Extra100') {
                                statusDisplay = <span className="text-sm text-red-600 flex items-center"><DollarSign className="w-4 h-4 mr-1" /> Pago Extra (100%)</span>;
                            } else if (decisionRecord === 'Compensacao') {
                                statusDisplay = <span className="text-sm text-blue-600 flex items-center"><CalendarCheck className="w-4 h-4 mr-1" /> Compensado (Banco de Horas)</span>;
                            } else {
                                // Folga Fixa sem trabalho ou decisão
                                statusDisplay = <span className="text-sm text-muted-foreground">Folga Fixa</span>;
                            }
                        } else if (isFalta) {
                            const faltaRegistro = registros.find(r => r.tipo === 'Falta');
                            const atestadoUrl = faltaRegistro?.atestado_url;
                            const observacaoFalta = faltaRegistro?.observacao || '';
                            
                            let displayText: string;

                            // Lógica de exibição para Falta Injustificada (parcial ou total)
                            let displayObs = observacaoFalta;
                            if (!atestadoUrl && observacaoFalta.includes('Falta Injustificada')) {
                                const horasInformadas = minutosAbonados / 60;
                                
                                if (horasInformadas === JORNADA_DIARIA_PADRAO) {
                                    displayText = 'Falta Injustificada';
                                } else {
                                    const horasStr = Number.isInteger(horasInformadas) ? `${horasInformadas}h` : `${horasInformadas.toFixed(1)}h`;
                                    const faltasAbonadas = Math.max(0, JORNADA_DIARIA_PADRAO - horasInformadas);
                                    const faltasAbonadasStr = Number.isInteger(faltasAbonadas) ? `${faltasAbonadas}h` : `${faltasAbonadas.toFixed(1)}h`;
                                    
                                    // Exibe a falta parcial e o saldo abonado (que é o tempo que falta para 8h)
                                    displayObs = `Falta Injustificada (${horasStr})` + (faltasAbonadas > 0 ? ` e faltas abonadas (${faltasAbonadasStr})` : '');
                                    displayText = displayObs;
                                }
                            } else {
                                // Falta justificada (com atestado) — exibe observação/atestado
                                displayText = faltaRegistro?.observacao || 'Falta Justificada';
                            }
                            
                            statusDisplay = atestadoUrl 
                                ? <span className="text-sm text-green-600 flex items-center"><FileText className="w-4 h-4 mr-1" /> {displayText}</span>
                                : <span className="text-sm text-red-600 flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> {displayText}</span>;
                        } else if (isAbono) {
                            const abonoRegistro = registros.find(r => r.tipo === 'Abono');
                            const observacaoAbono = abonoRegistro?.observacao || 'Abono';
                            statusDisplay = <span className="text-sm text-blue-600 flex items-center"><Clock className="w-4 h-4 mr-1" /> {observacaoAbono}</span>;
                        } else if (registros.length === 0) {
                            statusDisplay = <span className="text-sm text-muted-foreground">{isDiaFuturo ? 'Futuro' : 'Sem Registro'}</span>;
                        } else {
                            // Exibe as horas calculadas
                            statusDisplay = (
                                <span className={cn(isTurnoAberto && !isFalta && !isAbono && !isDiaAtual ? "text-yellow-600 font-bold" : "")}>
                                    {formatarHoras(minutos)}
                                    {isTurnoAberto && !isFalta && !isAbono && !isDiaAtual && (
                                        <AlertTriangle className="w-4 h-4 ml-1 inline-block align-text-bottom" />
                                    )}
                                </span>
                            );
                        }

                        // 2. Encontra registros para edição/exclusão
                        const registroFaltaAbonoCompensacao = registros.find(r => r.tipo === 'Falta' || r.tipo === 'Abono' || r.tipo === 'Compensacao' || r.tipo === 'Extra100');
                        const hasPontoRecordsOnly = hasPontoRecords && !registroFaltaAbonoCompensacao;
                        
                        // 3. Determina a cor de fundo
                        const rowClassName = cn(
                            isFolgaFixa && 'bg-secondary/30',
                            isFerias && 'bg-purple-100/50 dark:bg-purple-900/20',
                            (isFalta || isAbono) && 'bg-blue-100/50 dark:bg-blue-900/20',
                            needsManagement && 'bg-yellow-100/50 dark:bg-yellow-900/20 border-l-4 border-yellow-500',
                        );

                        // Determina o tempo a ser exibido na coluna Total Dia
                        const totalDiaDisplay = isFolgaFixa && hasPontoRecords && (decisionRecord || needsManagement) 
                            ? formatarHoras(minutosTrabalhadosFolga) 
                            : (isFaltaJustificada || isAbono && !isCompensacaoAbono ? formatarHoras(minutos) : statusDisplay);

                        return (
                            <TableRow key={diaString} className={rowClassName}>
                                <TableCell className="font-medium text-xs md:text-sm">
                                    {format(data, 'dd/MM')}
                                    <span className="block text-muted-foreground text-[10px] md:hidden">{format(data, '(EEE)', { locale: ptBR })}</span>
                                </TableCell>
                                
                                {/* Coluna de Registros (Oculta em Mobile) */}
                                <TableCell className="hidden md:table-cell">
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {/* AVISO DE FOLGA TRABALHADA (Sempre visível se trabalhou na folga) */}
                                        {isFolgaFixa && hasPontoRecords && (
                                            <span className="text-xs font-semibold text-red-600 bg-red-100 dark:bg-red-900/50 px-2 py-1 rounded-full">
                                                TRABALHOU NA FOLGA
                                            </span>
                                        )}
                                        
                                        {/* AVISO DE DECISÃO (Pago Extra ou Compensado) */}
                                        {isFolgaFixa && hasPontoRecords && decisionRecord && (
                                            <span className={cn(
                                                "text-xs font-semibold px-2 py-1 rounded-full",
                                                decisionRecord === 'Extra100' ? "bg-red-500 text-white" : "bg-blue-500 text-white"
                                            )}>
                                                {decisionRecord === 'Extra100' ? 'PAGO EXTRA' : 'COMPENSADO'}
                                            </span>
                                        )}

                                        {registros.filter(r => r.tipo !== 'Compensacao' && r.tipo !== 'Extra100').map(r => {
                                            let registroDisplay;
                                            
                                            if (r.tipo === 'Falta') {
                                                // NOVO: Exibe a observação da falta
                                                const observacaoFalta = r.observacao || 'Falta Injustificada';
                                                
                                                registroDisplay = (
                                                    <>
                                                        {observacaoFalta}
                                                        {r.atestado_url && (
                                                            <a 
                                                                href={r.atestado_url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                className="ml-1 text-primary hover:text-primary/80 inline-flex items-center"
                                                                title="Ver Atestado"
                                                            >
                                                                <FileText className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </>
                                                );
                                            } else if (r.tipo === 'Abono') {
                                                // Se for abono de compensação, exibe apenas a observação (sem a palavra Abono)
                                                if (r.observacao?.includes('Compensação de folga trabalhada')) {
                                                    registroDisplay = r.observacao;
                                                } else {
                                                    // Abono normal (4h, 6h, 8h)
                                                    registroDisplay = `Abono (${r.observacao})`;
                                                }
                                            } else {
                                                // Entrada/Saída
                                                registroDisplay = (
                                                    <>
                                                        {r.tipo}: {format(parseISO(r.horario_registro), 'HH:mm')}
                                                        {r.maps_url && (
                                                            <a 
                                                                href={r.maps_url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                className="ml-1 text-blue-500 hover:text-blue-700 inline-flex items-center"
                                                                title="Ver Localização"
                                                            >
                                                                <MapPin className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                        {r.selfie_url && (
                                                            <button 
                                                                onClick={() => handleViewSelfie(r.selfie_url)} 
                                                                className="ml-1 text-primary hover:text-primary/80 inline-flex items-center"
                                                                title="Ver Selfie"
                                                            >
                                                                <Camera className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </>
                                                );
                                            }
                                            
                                            return (
                                                <span key={r.id} className="text-sm bg-muted px-2 py-1 rounded-full flex items-center">
                                                    {registroDisplay}
                                                </span>
                                            );
                                        })}
                                        
                                        {/* Renderiza o botão de Gerenciar Folga Trabalhada se necessário */}
                                        {actionButton}
                                    </div>
                                </TableCell>
                                
                                {/* Coluna Total Dia */}
                                <TableCell className="text-right font-semibold text-xs md:text-sm">
                                    {totalDiaDisplay}
                                </TableCell>
                                
                                {/* Coluna Ações (Visível em Mobile) */}
                                <TableCell className="text-right min-w-[100px]">
                                    <div className="flex justify-end space-x-1">
                                        {canEdit && !isDiaFuturo && !isFerias && !needsManagement && (
                                            <>
                                                {/* Edição/Exclusão de Falta/Abono/Compensação/Extra100 */}
                                                {registroFaltaAbonoCompensacao && (
                                                    <>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => {
                                                                if (isFolgaFixa && hasPontoRecords) {
                                                                    // Se for folga fixa trabalhada e já tem decisão, reabre o dialog de gestão de folga
                                                                    onManageWorkedDayOff(data, registros.filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida'));
                                                                } else {
                                                                    // Se for Falta/Abono, usa o dialog de GerenciarFaltas
                                                                    onEditFaltaAbono(registroFaltaAbonoCompensacao, data);
                                                                }
                                                            }}
                                                            title="Editar Decisão"
                                                            className="h-6 w-6 text-primary hover:text-primary/80"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => handleDelete(registroFaltaAbonoCompensacao.id)}
                                                            title="Excluir Decisão"
                                                            className="h-6 w-6 text-red-500 hover:text-red-700"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                                {/* Botão de Ajuste de Ponto (Aparece se houver registros de Entrada/Saída E não houver decisão de Falta/Abono/Compensação) */}
                                                {hasPontoRecordsOnly && (
                                                    <Button 
                                                        variant="outline" 
                                                        size="icon" 
                                                        onClick={() => onEditRegistro(data)} // Ajuste de Ponto (Entrada/Saída)
                                                        title="Ajustar Ponto"
                                                        className="h-6 w-6"
                                                    >
                                                        <Edit className="w-3 h-3" />
                                                    </Button>
                                                )}
                                                {/* Botão de Marcar Falta (Aparece se não houver registro e não for folga fixa/ferias/futuro) */}
                                                {!hasPontoRecordsOnly && !registroFaltaAbonoCompensacao && !isFolgaFixa && !isFerias && !isDiaFuturo && (
                                                    <Button 
                                                        variant="destructive" 
                                                        size="icon" 
                                                        onClick={() => onEditFaltaAbono(null, data)} // Marcar Falta (registro é null)
                                                        title="Marcar Falta"
                                                        className="h-6 w-6"
                                                    >
                                                        <CalendarX className="w-3 h-3" />
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                        {/* Renderiza o botão de Gerenciar Folga Trabalhada se necessário (apenas em desktop) */}
                                        {needsManagement && canEdit && (
                                            <Button 
                                                variant="default" 
                                                size="icon" 
                                                onClick={() => onManageWorkedDayOff(data, registros.filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida'))}
                                                title="Gerenciar Compensação"
                                                className="h-6 w-6 bg-yellow-600 hover:bg-yellow-700"
                                            >
                                                <AlertTriangle className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Visualização da Selfie */}
      <Dialog open={selfieModalOpen} onOpenChange={setSelfieModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Selfie do Registro de Ponto</DialogTitle>
          </DialogHeader>
          {selfieUrl ? (
            <img src={selfieUrl} alt="Selfie do Registro" className="w-full h-auto rounded-md" />
          ) : (
            <p className="text-center text-muted-foreground">Nenhuma selfie disponível.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DetalheFolhaPonto;