import React, { useRef } from 'react';
import { UploadedFile, FileType } from '../types';
import { readFileAsBase64, generateId, formatFileSize } from '../utils/fileHelpers';

interface SidebarProps {
  files: UploadedFile[];
  onFileUpload: (files: UploadedFile[]) => void;
  onRemoveFile: (fileId: string) => void;
  onGenerateAudio?: (file: UploadedFile) => void;
  isProcessing: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ files, onFileUpload, onRemoveFile, onGenerateAudio, isProcessing, isOpen, onToggle }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFiles: UploadedFile[] = [];
      for (let i = 0; i < event.target.files.length; i++) {
        const file = event.target.files[i];
        try {
          const content = await readFileAsBase64(file);
          newFiles.push({
            id: generateId(),
            name: file.name,
            type: file.type,
            size: file.size,
            content: content,
            processed: false
          });
        } catch (e) {
          console.error(e);
        }
      }
      onFileUpload(newFiles);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`${isOpen ? 'w-80' : 'w-20'} transition-[width] duration-300 ease-in-out border-r border-paper-400 flex flex-col h-full flex-shrink-0 bg-paper-300 shadow-[inset_-10px_0_20px_rgba(0,0,0,0.02)] z-20 relative`}>
      {/* Texture overlay */}
      <div className="absolute inset-0 opacity-30 pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/cardboard.png')]"></div>

      {/* Toggle Tab */}
      <button 
        onClick={onToggle}
        className="absolute -right-3 top-8 w-6 h-6 bg-paper-800 text-paper-100 rounded-full flex items-center justify-center border border-paper-900 shadow-md hover:bg-ink-red transition-colors z-50 focus:outline-none"
        title={isOpen ? "Collapse Archives" : "Expand Archives"}
      >
        <svg className={`w-3 h-3 transition-transform duration-300 ${!isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className={`p-6 border-b-2 border-paper-400 border-double bg-paper-300 relative flex items-center ${!isOpen ? 'justify-center p-4' : ''}`}>
        <div className={`flex items-center gap-3 transition-all duration-300 ${!isOpen ? 'justify-center' : ''}`}>
          <span className="p-1 border border-paper-800 rounded-sm bg-paper-200 shadow-sm flex-shrink-0">
            <svg className="w-6 h-6 text-ink-red" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </span>
          <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100' : 'w-0 opacity-0 hidden'}`}>
            <h1 className="text-2xl font-bold font-display text-paper-900 tracking-wide whitespace-nowrap">
              ARCHIVES
            </h1>
          </div>
        </div>
      </div>
      
      {/* Subheader info - hidden when closed */}
       <div className={`px-6 overflow-hidden transition-all duration-300 ${isOpen ? 'h-auto opacity-100 mb-0' : 'h-0 opacity-0'}`}>
          <p className="text-xs text-paper-800 mt-2 font-mono tracking-widest uppercase opacity-80 whitespace-nowrap font-semibold">Case: Gemini-3-Pro</p>
       </div>

      <div className="p-4 flex-grow overflow-y-auto overflow-x-hidden relative">
        <div className="mb-8">
          <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'h-auto opacity-100 mb-4' : 'h-0 opacity-0 mb-0'}`}>
            <h2 className="text-xs font-bold text-paper-600 uppercase tracking-widest font-display border-b border-paper-400 pb-1 whitespace-nowrap">Index Registry</h2>
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
            className="hidden"
          />
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className={`w-full rounded-sm border-2 border-dashed font-serif italic text-lg transition-all flex items-center justify-center font-medium
              ${isProcessing 
                ? 'bg-transparent border-paper-400 text-paper-500 cursor-not-allowed' 
                : 'border-paper-600 bg-paper-200 text-paper-900 hover:bg-paper-100 hover:border-ink-red hover:text-ink-red shadow-sm'
              }
              ${isOpen ? 'py-3 px-4' : 'py-3 px-1 aspect-square'}
              `}
             title="Add Evidence"
          >
            {isOpen ? (isProcessing ? 'Cataloging...' : '+ Add Evidence') : (isProcessing ? '...' : '+')}
          </button>
        </div>

        <div className="space-y-4">
          {files.map(file => (
            <div key={file.id} className={`group relative bg-paper-200 border border-paper-400 shadow-md hover:rotate-0 transition-all duration-300 before:absolute before:inset-0 before:bg-paper-500/5 before:pointer-events-none ${isOpen ? 'p-3 rotate-1' : 'p-2 rotate-0 justify-center flex'}`}>
              {/* Pin - only visible when open */}
              <div className={`absolute -top-2 -left-2 w-4 h-4 rounded-full bg-paper-400 shadow-inner flex items-center justify-center border border-paper-500 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-paper-800 opacity-20"></div>
              </div>
              
              <div className={`flex items-start ${isOpen ? 'gap-3' : 'justify-center'}`}>
                <div className={`mt-1 flex-shrink-0 ${file.processed ? 'text-green-800 opacity-80' : 'text-paper-500'}`}>
                  {file.processed ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  )}
                </div>
                
                <div className={`flex-1 min-w-0 transition-all duration-300 ${isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 hidden'}`}>
                  <p className="text-base font-serif text-paper-900 leading-tight truncate font-semibold">{file.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] font-mono text-paper-600 uppercase tracking-wider font-medium">{file.type.split('/')[1]}</span>
                    <span className="text-[11px] font-mono text-paper-600 font-medium">{formatFileSize(file.size)}</span>
                  </div>
                </div>
                
                {/* Actions - Only when open */}
                {!isProcessing && isOpen && (
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      
                      {/* Audio Button */}
                      {file.processed && onGenerateAudio && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              onGenerateAudio(file);
                            }}
                            className="p-1 text-paper-600 hover:text-ink-blue flex-shrink-0"
                            title="Generate Audio Spark"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                          </button>
                      )}

                      {/* Delete Button */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFile(file.id);
                        }}
                        className="p-1 text-paper-600 hover:text-ink-red flex-shrink-0"
                        title="Remove from Archives"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                  </div>
                )}
              </div>
              
              {!file.processed && !file.processingError && isOpen && (
                 <div className="mt-2 w-full bg-paper-300 h-0.5 rounded-full overflow-hidden">
                    <div className="bg-ink-red h-full w-full animate-progress origin-left opacity-60"></div>
                 </div>
              )}
            </div>
          ))}

          {files.length === 0 && (
            <div className={`text-center py-10 opacity-70 transition-opacity duration-300 ${isOpen ? 'opacity-70' : 'opacity-0 hidden'}`}>
              <p className="text-sm font-serif italic text-paper-900 font-medium">Registry is empty.</p>
              <p className="text-xs font-mono text-paper-600 mt-2 font-medium">Awaiting documents for classification.</p>
            </div>
          )}
        </div>
      </div>
      
      <div className={`p-4 border-t border-paper-400 bg-paper-300 text-[11px] font-bold font-mono text-paper-800 text-center uppercase tracking-widest opacity-60 overflow-hidden whitespace-nowrap transition-all duration-300 ${isOpen ? 'opacity-60' : 'opacity-0'}`}>
        Classified Top Secret
      </div>
    </div>
  );
};

export default Sidebar;