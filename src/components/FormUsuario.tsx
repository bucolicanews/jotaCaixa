// ... (linhas 731-733)
  if (isClient) {
    // Renderização para edição de Cliente (Empresa)
    // const clientProfile = usuarioInicial as ClienteProfile; // Removido TS6133
    
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <h3 className="font-semibold text-lg">Dados de Identificação</h3>
          {renderInputField('nome', 'Nome da Empresa', 'Nome completo', true)}
          <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" value={(usuarioInicial as ClienteProfile).email} disabled /></FormControl><FormMessage /></FormItem>
          <FormField control={form.control as unknown as Control<FormValues>} name="limite_usuarios" render={({ field }) => (
            <FormItem><FormLabel>Limite de Usuários da Equipe</FormLabel><FormControl><Input type="number" placeholder="5" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          
          <h3 className="font-semibold text-lg mt-6">Tags de Contrato (Dados Cadastrais)</h3>
          <p className="text-sm text-muted-foreground mb-4">Marque os campos que devem ser usados como tags dinâmicas em seus modelos de contrato.</p>
          
          {/* Botões de Seleção de Tags */}
          <div className="flex space-x-2 mb-4">
              <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleToggleAllTags(true)} 
                  disabled={isSubmitting}
              >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Marcar Todas as Tags
              </Button>
              <Button 
                  type="button" 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => handleToggleAllTags(false)} 
                  disabled={isSubmitting}
              >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <XCircle className="w-4 h-4 mr-1" />}
                  Desmarcar Todas as Tags
              </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderInputField('documento', 'CPF/CNPJ', '00.000.000/0000-00')}
              {renderInputField('rg', 'RG', '00.000.000-0')}
          </div>
// ... (restante do arquivo)