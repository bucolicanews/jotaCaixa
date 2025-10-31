import { UsuarioProfile } from '@/types/usuario';
import React from 'react';

// Definindo o tipo de coluna simplificado (compatível com o placeholder de DataTable)
interface ColumnDef<TData> {
  accessorKey: keyof TData | string;
  header: string;
  cell?: ({ row }: { row: any }) => React.ReactNode;
}

// Tipo simplificado para o usuário que estamos buscando
interface UsuarioPonto extends UsuarioProfile {
    cliente_nome?: string;
}

export const columns = (isAdmin: boolean): ColumnDef<UsuarioPonto>[] => {
    const baseColumns: ColumnDef<UsuarioPonto>[] = [
        {
            accessorKey: 'nome',
            header: 'Nome do Usuário',
        },
        {
            accessorKey: 'email',
            header: 'Email',
        },
        {
            accessorKey: 'status',
            header: 'Status',
        },
        {
            accessorKey: 'data_criacao',
            header: 'Criado em',
        },
    ];

    if (isAdmin) {
        baseColumns.unshift({
            accessorKey: 'cliente_nome',
            header: 'Empresa/Cliente',
        });
    }

    return baseColumns;
};