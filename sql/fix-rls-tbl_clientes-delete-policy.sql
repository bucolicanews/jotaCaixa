ALTER POLICY "tbl_clientes_delete"
ON "public"."tbl_clientes"
FOR DELETE
TO public
USING (
  (id = auth.uid()) OR 
  (admin_id = auth.uid()) OR 
  (get_admin_id_for_current_user() = admin_id)
);
