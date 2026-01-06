-- Remover políticas antigas do bucket protocolos_files
DROP POLICY IF EXISTS "Allow authenticated uploads to protocolos_files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to protocolos_files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from protocolos_files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete from protocolos_files" ON storage.objects;

-- Criar políticas corretas para protocolos_files (SEM IF NOT EXISTS)
CREATE POLICY "Allow authenticated uploads to protocolos_files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'protocolos_files');

CREATE POLICY "Allow authenticated updates to protocolos_files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'protocolos_files');

CREATE POLICY "Allow public read from protocolos_files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'protocolos_files');

CREATE POLICY "Allow authenticated delete from protocolos_files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'protocolos_files');
