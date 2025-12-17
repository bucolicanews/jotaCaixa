import React, { useState, useCallback, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
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

// O tipo do Ref que será exposto. Incluímos o editor Quill para manipulação.
export interface RichTextEditorRef {
  getEditor: () => ReactQuill | null;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({ value, onChange, placeholder, readOnly, className, isSimpleTextMode = false }, ref) => {
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const quillRef = useRef<ReactQuill>(null);

  useImperativeHandle(ref, () => ({
    getEditor: () => quillRef.current,
  }));

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
  
  const finalIsHtmlMode = isHtmlMode || isSimpleTextMode;

  return (
    <div className={cn(className, "flex flex-col h-full space-y-2")}>
      
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
          id="conteudo-template-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSimpleTextMode ? "Insira o conteúdo em texto simples aqui..." : "Edite o código HTML puro aqui..."}
          readOnly={readOnly}
          className="flex-1 font-mono text-sm min-h-[300px]"
        />
      ) : (
        <ReactQuill 
          ref={quillRef}
          theme="snow" 
          value={value} 
          onChange={onChange} 
          modules={modules}
          formats={formats}
          placeholder={placeholder}
          readOnly={readOnly}
          className="flex-1 flex flex-col" 
          style={{ height: '100%', minHeight: '300px' }}
        />
      )}
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;