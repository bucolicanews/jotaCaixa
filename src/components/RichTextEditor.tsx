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
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, readOnly, className }) => {
  const [isHtmlMode, setIsHtmlMode] = useState(false);

  const toggleHtmlMode = useCallback(() => {
    setIsHtmlMode(prev => !prev);
  }, []);

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, false] }],
        ['bold', 'italic', 'underline', 'strike', 'blockquote'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
        [{ 'align': [] }],
        ['link', 'image'],
        ['clean'],
        ['htmlButton'] // Botão customizado
      ],
      handlers: {
        htmlButton: toggleHtmlMode,
      }
    }
  }), [toggleHtmlMode]);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike', 'blockquote',
    'list', 'bullet', 'indent',
    'link', 'image', 'align'
  ];

  if (isHtmlMode) {
    return (
      <div className={cn(className, "flex flex-col h-full space-y-2")}>
        <Button 
          type="button" 
          variant="secondary" 
          onClick={toggleHtmlMode} 
          className="w-full justify-start"
          disabled={readOnly}
        >
          <Edit className="w-4 h-4 mr-2" /> Voltar para Editor Visual
        </Button>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Edite o código HTML puro aqui..."
          readOnly={readOnly}
          className="flex-1 font-mono text-sm min-h-[300px]"
        />
      </div>
    );
  }

  return (
    <div className={cn(className, "flex flex-col h-full")}>
      <ReactQuill 
        theme="snow" 
        value={value} 
        onChange={onChange} 
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
        className="flex-1 flex flex-col" 
      />
      {/* Adiciona o botão HTML abaixo do editor visual para o usuário alternar */}
      <Button 
        type="button" 
        variant="outline" 
        onClick={toggleHtmlMode} 
        className="mt-2 w-full justify-start"
        disabled={readOnly}
      >
        <Code className="w-4 h-4 mr-2" /> Editar Código-Fonte HTML
      </Button>
    </div>
  );
};

export default RichTextEditor;