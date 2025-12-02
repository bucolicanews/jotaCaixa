import { PERMISSOES_DISPONIVEIS } from "./permissoes";

// Permissões que são módulos de empresa (excluindo ponto eletrônico e visualização própria)
const MODULOS_EMPRESA = PERMISSOES_DISPONIVEIS
    .filter(p => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto' && p.key !== 'cadastrar_usuarios' && p.key !== 'planos');

// Permissões para Pessoa Jurídica (Todos os módulos de empresa)
export const PERMISSOES_PJ = MODULOS_EMPRESA.reduce((acc, p) => {
    acc[p.key] = true;
    return acc;
}, {} as Record<string, boolean>);

// Permissões para Pessoa Física (Apenas o essencial)
export const PERMISSOES_PF = MODULOS_EMPRESA.reduce((acc, p) => {
    const isEssential = ['contas_pagar', 'contas_receber', 'clientes', 'relatorios'].includes(p.key);
    acc[p.key] = isEssential;
    return acc;
}, {} as Record<string, boolean>);

// NOVO: Permissões de Acesso Total para o Trial de 7 dias
export const PERMISSOES_TRIAL_COMPLETO = PERMISSOES_DISPONIVEIS.reduce((acc, p) => {
    // Ativa todos os módulos, exceto os exclusivos de Admin (como 'planos')
    if (p.key !== 'planos') {
        acc[p.key] = true;
    }
    return acc;
}, {} as Record<string, boolean>);