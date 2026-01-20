-- =====================================================
-- Migration: Remover policy antiga que conflita
-- Data: 2026-01-20
-- Descrição: Remover owner_can_manage_extratos que usa get_owner_id()
-- =====================================================

DROP POLICY IF EXISTS "owner_can_manage_extratos" ON public.extratos;
