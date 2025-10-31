// ... (código anterior, final do bloco de renderização do Cliente)
    );
  }

  // Renderização para Usuário (Funcionário)
  const isContractEditable = criadorRole === 'Admin' || criadorRole === 'Cliente';
  const isNewUser = !isEditing;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
            <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/5">Geral</TabsTrigger>
            {isUserBeingManagedByClient && <TabsTrigger value="folgas" className="flex-1 md:flex-none md:w-1/5">Folgas/Férias</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/5">Dados Cadastrais</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="documentos" className="flex-1 md:flex-none md:w-1/5">Documentos</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="contrato" className="flex-1 md:flex-none md:w-1/5">Contrato (RH)</TabsTrigger>}
          </TabsList>

          {/* TAB 1: GERAL (Nome, Email, Senha, Permissões, Salário) */}
          <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
            <FormField control={form.control as unknown as Control<FormValues>} name="nome" render={({ field }) => (
              <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Nome completo" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control as unknown as Control<FormValues>} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing} /></FormControl><FormMessage /></FormItem>
            )} />
            {!isEditing && (
              <FormField control={form.control as unknown as Control<FormValues>} name="senha" render={({ field }) => (
                <FormItem><FormLabel>Senha Provisória</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            )}
            
            <h4 className="font-semibold mt-6 border-t pt-4">Remuneração e Jornada</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {renderNumberField('salario', 'Salário Mensal (R$)', '3000.00', isNewUser)}
                {renderNumberField('horas_semanais', 'Horas Semanais', '44', isNewUser)}
                {renderNumberField('horas_mensais', 'Horas Mensais', '220', isNewUser)}
            </div>

            {(isClientBeingManagedByAdmin || isUserBeingManagedByClient) && (
              <div className="space-y-2 pt-4 border-t">
                <div className="flex justify-between items-center mb-1">
                  <FormLabel>Permissões de Acesso</FormLabel>
                  <div className="space-x-2">
                    <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto">Selecionar Todos</Button>
                    <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive">Desmarcar Todos</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                  {permissoesVisiveis.map((p: Permissao) => (
                    <FormField key={p.key} control={form.control as unknown as Control<FormValues>} name={`permissoes.${p.key}`} render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="font-normal">{p.label}</FormLabel>
                      </FormItem>
                    )} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          
          {/* TAB 2: FOLGAS E FÉRIAS */}
          {isUserBeingManagedByClient && (
            <TabsContent value="folgas" className="mt-4 space-y-6 p-4">
                <h4 className="font-semibold">Configuração de Folgas Fixas</h4>
                <FormField
                    control={form.control as unknown as Control<FormValues>}
                    name="folga_domingo_obrigatoria"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    disabled={isNewUser}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                    Considerar Domingo como Folga Obrigatória (Padrão CLT)
                                </FormLabel>
                                <p className="text-sm text-muted-foreground">
                                    Desmarque se o funcionário trabalha em escala 6x1 ou 12x36 e o domingo não é garantido como folga.
                                </p>
                            </div>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control as unknown as Control<FormValues>}
                    name="dias_folga_fixos"
                    render={() => (
                        <FormItem>
                            <FormLabel>Dias de Folga Fixos (Além do Domingo)</FormLabel>
                            <div className="grid grid-cols-3 gap-2">
                                {DIAS_DA_SEMANA.map((item) => (
                                    <FormField
                                        key={item.value}
                                        control={form.control as unknown as Control<FormValues>}
                                        name="dias_folga_fixos"
                                        render={({ field: arrayField }) => {
                                            const current = arrayField.value || [];
                                            const isChecked = current.includes(item.value);
                                            return (
                                                <FormItem
                                                    key={item.value}
                                                    className="flex flex-row items-start space-x-3 space-y-0"
                                                >
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    arrayField.onChange([...current, item.value]);
                                                                } else {
                                                                    arrayField.onChange(
                                                                        current.filter((value) => value !== item.value)
                                                                    );
                                                                }
                                                            }}
                                                            disabled={isNewUser}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                        {item.label}
                                                    </FormLabel>
                                                </FormItem>
                                            );
                                        }}
                                    />
                                ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                
                {isEditing && isUser && (
                    <div className="pt-6 border-t">
                        <GerenciarFerias 
                            funcionarioId={usuarioInicial.id} 
                            empresaId={(usuarioInicial as UsuarioProfile).cliente_id!} 
                        />
                    </div>
                )}
            </TabsContent>
          )}

          {/* TAB 3: DADOS CADASTRAIS (Apenas para Usuário/Funcionário) */}
          {isUserBeingManagedByClient && (
            <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
              <p className="text-sm text-muted-foreground">Dados pessoais e de contato do funcionário.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInputField('cpf', 'CPF', '000.000.000-00', false, isNewUser)}
                  {renderInputField('rg', 'RG', '00.000.000-0', false, isNewUser)}
              </div>

              {renderInputField('nome_mae', 'Nome da Mãe', 'Nome completo da mãe', false, isNewUser)}
              {renderInputField('nome_pai', 'Nome do Pai', 'Nome completo do pai', false, isNewUser)}
              {renderInputField('telefone', 'Telefone de Contato', '(00) 90000-0000', false, isNewUser)}

              <h4 className="font-semibold mt-6 border-t pt-4">Endereço</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {renderInputField('cep', 'CEP', '00000-000', false, isNewUser)}
                  {renderInputField('cidade', 'Cidade', 'São Paulo', false, isNewUser)}
                  {renderInputField('estado', 'Estado (UF)', 'SP', false, isNewUser)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {renderInputField('endereco', 'Logradouro/Rua', 'Rua Exemplo', false, isNewUser)}
                  {renderInputField('numero', 'Número', '123', false, isNewUser)}
                  {renderInputField('complemento', 'Complemento', 'Apto 101', false, isNewUser)}
              </div>
              {renderInputField('bairro', 'Bairro', 'Centro', false, isNewUser)}
            </TabsContent>
          )}

          {/* TAB 4: DOCUMENTOS DE ADMISSÃO (Apenas para Usuário/Funcionário) */}
          {isUserBeingManagedByClient && (
            <TabsContent value="documentos" className="mt-4 space-y-6 p-4">
              <p className="text-sm text-muted-foreground">Anexos de documentos do funcionário.</p>
              
              <Accordion type="multiple" className="w-full">
                  <AccordionItem value="pessoais">
                      <AccordionTrigger className="font-semibold">Documentos Pessoais</AccordionTrigger>
                      <AccordionContent className="space-y-4 p-2">
                          {renderDocumentField('rg_url', 'Cópia do RG (Frente e Verso)', true)}
                          {renderDocumentField('cpf_url', 'Cópia do CPF', true)}
                          {renderDocumentField('ctps_url', 'Carteira de Trabalho (CTPS)', true)}
                          {renderDocumentField('cartao_pis_url', 'Cartão do PIS', false)}
                          {renderDocumentField('cnh_url', 'CNH (Se for motorista)', false)}
                      </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="militares">
                      <AccordionTrigger className="font-semibold">Obrigações Militares e Eleitorais</AccordionTrigger>
                      <AccordionContent className="space-y-4 p-2">
                          {renderDocumentField('titulo_eleitor_url', 'Título de Eleitor', false)}
                          {renderDocumentField('reservista_url', 'Certidão de Reservista (Homens +18)', false)}
                      </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="estado_civil">
                      <AccordionTrigger className="font-semibold">Estado Civil e Filiação</AccordionTrigger>
                      <AccordionContent className="space-y-4 p-2">
                          {renderDocumentField('certidao_nascimento_url', 'Certidão de Nascimento (Solteiro)', false)}
                          {renderDocumentField('certidao_casamento_url', 'Certidão de Casamento (Casado)', false)}
                          <FormItem>
                              <FormLabel>Certidões de Nascimento dos Filhos (Menores de 14)</FormLabel>
                              <Input type="file" multiple disabled placeholder="Em breve" />
                          </FormItem>
                      </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="outros">
                      <AccordionTrigger className="font-semibold">Outros Documentos</AccordionTrigger>
                      <AccordionContent className="space-y-4 p-2">
                          {renderDocumentField('comprovante_residencia_url', 'Comprovante de Residência', true)}
                          {renderDocumentField('comprovante_escolaridade_url', 'Comprovante de Escolaridade', true)}
                          {renderDocumentField('exame_admissional_url', 'Exame Médico Admissional', true)}
                          {renderDocumentField('foto_3x4_url', 'Foto 3x4', true)}
                          <FormField
                              control={form.control as unknown as Control<FormValues>}
                              name="ja_admitido_anteriormente"
                              render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                      <FormControl>
                                          <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                          />
                                      </FormControl>
                                      <div className="space-y-1 leading-none">
                                          <FormLabel>
                                              Já foi admitido anteriormente?
                                          </FormLabel>
                                      </div>
                                  </FormItem>
                              )}
                          />
                      </AccordionContent>
                  </AccordionItem>
              </Accordion>
            </TabsContent>
          )}

          {/* TAB 5: DADOS CONTRATUAIS (RH) - Apenas para Usuário/Funcionário) */}
          {isUserBeingManagedByClient && (
            <TabsContent value="contrato" className="mt-4 space-y-6 p-4">
                <p className="text-sm text-muted-foreground">Estes campos são usados para gestão de RH.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderDateField('data_inicio_contrato', 'Início do Contrato', !isContractEditable)}
                    {renderDateField('data_fim_contrato', 'Fim do Contrato', !isContractEditable)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderDateField('data_inicio_aviso', 'Início do Aviso Prévio', !isContractEditable)}
                    <FormField
                        control={form.control as unknown as Control<FormValues>}
                        name="tipo_aviso"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Aviso</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || 'Nenhum'} disabled={!isContractEditable}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o tipo de aviso" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Nenhum">Nenhum</SelectItem>
                                        <SelectItem value="Trabalhado">Trabalhado</SelectItem>
                                        <SelectItem value="Indenizado">Indenizado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </TabsContent>
          )}
        </Tabs>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || uploading || isSubmitting}>
          {(form.formState.isSubmitting || uploading || isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Conta'}
        </Button>
      </form>
    </Form>
  );
};

export default FormUsuario;