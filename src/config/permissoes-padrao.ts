import { PERMISSOES_DISPONIVEIS } from "./permissoes";

const MODULOS_EMPRESA = PERMISSOES_DISPONIVEIS
    .filter(p => p.grupo !== 'folha' && p.grupo !== 'rh');

export const PERMISSOES_PJ = MODULOS_EMPRESA.reduce((acc, p) => {
    acc[p.key] = true;
    return acc;
}, {} as Record<string, boolean>);

export const PERMISSOES_PF = MODULOS_EMPRESA.reduce((acc, p) => {
    const isEssential = ['contas_pagar', 'contas_receber', 'relatorios'].includes(p.key);
    acc[p.key] = isEssential;
    return acc;
}, {} as Record<string, boolean>);

export const PERMISSOES_TRIAL_COMPLETO = PERMISSOES_DISPONIVEIS.reduce((acc, p) => {
    acc[p.key] = true;
    return acc;
}, {} as Record<string, boolean>);
