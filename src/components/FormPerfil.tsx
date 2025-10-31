// ... (linhas 521-529)
  // --- Renderização Principal ---

  if (isClient) {
    // Renderização para Cliente (Empresa)
    
    return (
      <Form {...form}>
// ... (linhas 531-533)
  // Renderização para Usuário (Funcionário)
  // const isContractEditable = false; // Removido TS6133
  // const isNewUser = false; // Removido TS6133

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
            <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/5">Geral</TabsTrigger>
// ... (restante do arquivo)