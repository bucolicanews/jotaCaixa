import React from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Importa o tema padrão 'snow'
import { cn } from "@/lib/utils";
import { Textarea } from './ui/textarea'; // Importando Textarea para o modo simples

interface RichTextEditorProps {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  isSimpleTextMode?: boolean; // NOVO PROP
}

// Módulos completos para o modo HTML
const fullModules = {
  toolbar: [
    [{ 'header': [1, 2, false] }],
    ['bold', 'italic', 'underline', 'strike', 'blockquote'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
    [{ 'align': [] }],
    ['link', 'image'],
    ['clean']
  ],
};

const formats = [
  'header',
  'bold', 'italic', 'underline', 'strike', 'blockquote',
  'list', 'bullet', 'indent',
  'link', 'image', 'align'
];

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, readOnly, className, isSimpleTextMode = false }) => {
  
  const modules = fullModules;
  
  const handleChange = (content: string) => {
      onChange(content);
  };
  
  // Se for modo texto simples, usa um Textarea
  if (isSimpleTextMode) {
      return (
          <Textarea
              id="conteudo-template-textarea" // ID para drag and drop
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              readOnly={readOnly}
              rows={20}
              className={cn(className, "font-mono text-sm")}
          />
      );
  }

  return (
    <div className={cn(className, "flex flex-col h-full")}>
      <style>{`
        /* Fixa a barra de ferramentas e permite rolagem no corpo do editor */
        .ql-toolbar.ql-snow {
          position: sticky;
          top: 0;
          z-index: 10;
          background: hsl(var(--background));
          border-top-left-radius: var(--radius);
          border-top-right-radius: var(--radius);
        }
        .ql-container.ql-snow {
          flex-grow: 1;
          overflow-y: auto; /* Permite rolagem no corpo do editor */
          min-height: 300px;
        }
      `}</style>
      <ReactQuill 
        theme="snow" 
        value={value} 
        onChange={handleChange} 
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
        className="flex-1 flex flex-col" 
      />
    </div>
  );
};

export default RichTextEditor;