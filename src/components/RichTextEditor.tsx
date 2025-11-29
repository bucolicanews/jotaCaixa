import React, { useState, useCallback, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { cn } from "@/lib/utils";
import { Button } from './ui/button';
import { Code, Edit } from 'lucide-react';
import { Textarea } from './ui/textarea';

interface RichTextEditorProps {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  isSimpleTextMode?: boolean; // NOVO PROP
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, readOnly, className, isSimpleTextMode = false }) => {
  const [isHtmlMode, setIsHtmlMode] = useState(false);

  const toggleHtmlMode = useCallback(() => {
    setIsHtmlMode(prev => !prev);
  }, []);

  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean'],
    ]
  }), []);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike', 'blockquote',
    'list', 'bullet', 'indent',
    'link', 'image', 'align'
  ];
  
  // Se estiver no modo de texto simples, forçamos o Textarea
  const finalIsHtmlMode = isHtmlMode || isSimpleTextMode;

  return (
    <div className={cn(className, "flex flex-col h-full space-y-2")}>
      
      {/* Botão de Alternância no Topo (Oculto se for modo de texto simples) */}
      {!isSimpleTextMode && (
          <div className="flex justify-end">
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={toggleHtmlMode} 
              disabled={readOnly}
              className="w-full sm:w-auto"
            >
              {finalIsHtmlMode ? (
                <>
                  <Edit className="w-4 h-4 mr-2" /> Voltar para Editor Visual
                </>
              ) : (
                <>
                  <Code className="w-4 h-4 mr-2" /> Editar Código-Fonte HTML
                </>
              )}
            </Button>
          </div>
      )}

      {finalIsHtmlMode ? (
        <Textarea
          id="conteudo-template-textarea" // Adicionando ID para manipulação de cursor
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSimpleTextMode ? "Insira o conteúdo em texto simples aqui..." : "Edite o código HTML puro aqui..."}
          readOnly={readOnly}
          className="flex-1 font-mono text-sm min-h-[300px]"
        />
      ) : (
        <ReactQuill 
          theme="snow" 
          value={value} 
          onChange={onChange} 
          modules={modules}
          formats={formats}
          placeholder={placeholder}
          readOnly={readOnly}
          className="flex-1 flex flex-col" 
          // Adicionando estilo para garantir que o editor tenha barra de rolagem
          style={{ height: '100%', minHeight: '300px' }}
        />
      )}
    </div>
  );
};

export default RichTextEditor;