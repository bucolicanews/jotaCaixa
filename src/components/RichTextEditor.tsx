import React from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Importa o tema padrão 'snow'
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
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

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, readOnly, className }) => {
  
  // Apenas usa o módulo completo
  const modules = fullModules;
  
  const handleChange = (content: string) => {
      onChange(content);
  };

  return (
    <div className={cn(className, "flex flex-col h-full")}>
      <ReactQuill 
        theme="snow" 
        value={value} 
        onChange={handleChange} 
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
        // Removendo altura fixa e usando flex-1 para ocupar o espaço restante
        className="flex-1 flex flex-col" 
      />
    </div>
  );
};

export default RichTextEditor;