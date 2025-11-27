import React, { useState, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'quill/dist/quill.snow.css'; // Importa o tema padrão do Quill

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, readOnly = false, className }) => {
  
  // Configuração dos módulos do Quill (ferramentas de formatação)
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
      ['link', 'image'],
      ['clean']
    ],
  }), []);

  return (
    <div className={className}>
      <ReactQuill 
        theme="snow" 
        value={value} 
        onChange={onChange} 
        modules={modules}
        placeholder={placeholder}
        readOnly={readOnly}
        className="h-64 pb-10" // Altura fixa para o editor
      />
    </div>
  );
};

export default RichTextEditor;