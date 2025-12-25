import { supabase } from '@/integrations/supabase/client';

interface ContabilSetupPayload {
  proprietarioId: string;
}

export const triggerContabilSetup = async (payload: ContabilSetupPayload) => {
  const { data, error } = await supabase.functions.invoke('contabil-setup', {
    body: payload,
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
};
