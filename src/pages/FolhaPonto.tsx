import React, { useState } from 'react';
import { useFeriasCLT } from '@/hooks/use-ferias-clt';

// Mock types needed for compilation
interface FuncionarioDetalhe {
    data_inicio_contrato: string | null | undefined;
    is_admin: boolean;
}

const FolhaPonto: React.FC = () => {
    // Variables needed for the hook call
    const [funcionarioSelecionadoId] = useState<string | null>('some-id');
    const [funcionarioDetalhe] = useState<FuncionarioDetalhe>({
        data_inicio_contrato: '2020-01-01',
        is_admin: false,
    });
    
    const mesReferencia = new Date();

    // Hook call
    const {
        diasDeFeriasDireito,
        faltasInjustificadasAcumuladas,
    } = useFeriasCLT(
        funcionarioSelecionadoId || '', // Passa string vazia se for null/undefined
        funcionarioDetalhe?.data_inicio_contrato,
        mesReferencia,
        funcionarioDetalhe.is_admin
    );
    
    return (
        <div>
            <h1>Folha de Ponto</h1>
            <p>Dias de Férias de Direito: {diasDeFeriasDireito}</p>
            <p>Faltas Injustificadas: {faltasInjustificadasAcumuladas}</p>
        </div>
    );
};

export default FolhaPonto;