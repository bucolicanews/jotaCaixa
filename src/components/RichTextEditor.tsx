import React from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Importa o tema padrão 'snow'

interface RichTextEditorProps {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  isSimpleTextMode?: boolean; // NOVO PROP: Para modo Texto Simples
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

// Módulos simplificados para o modo Texto Simples (apenas formatação básica)
const simpleModules = {
    toolbar: [
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'align': [] }],
    ],
};

const formats = [
  'header',
  'bold', 'italic', 'underline', 'strike', 'blockquote',
  'list', 'bullet', 'indent',
  'link', 'image', 'align'
];

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, readOnly, className, isSimpleTextMode = false }) => {
  
  const modules = isSimpleTextMode ? simpleModules : fullModules;
  
  // No modo Texto Simples, forçamos a conversão para texto puro antes de chamar o onChange
  const handleChange = (content: string, delta: any, source: string, editor: any) => {
      if (isSimpleTextMode) {
          // Obtém o texto puro (mantendo apenas quebras de linha)
          const plainText = editor.getText().replace(/\n$/, '');
          onChange(plainText);
      } else {
          onChange(content);
      }
  };

  return (
    <div className={className}>
      <ReactQuill 
        theme="snow" 
        value={value} 
        onChange={handleChange} 
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
        className="h-64 pb-10" // Altura fixa para o editor
      />
    </div>
  );
};

export default RichTextEditor;