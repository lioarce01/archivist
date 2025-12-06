import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '../types';
import { decode, decodeAudioData } from '../utils/audioHelpers';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string, useSearch: boolean) => void;
  onGenerateHypotheses: (useSearch: boolean) => void;
  onCritique: (text: string | undefined, useSearch: boolean) => void;
  onMethodologyTransfer: (useSearch: boolean) => void;
  onGenerateExperiment: (text: string | undefined, useSearch: boolean) => void;
  onGenerateMatrix: (text: string | undefined, useSearch: boolean) => void;
  onAddToKnowledgeBase: (content: string, filename: string) => void;
  isTyping: boolean;
  filesCount: number;
}

// Sub-component for Reasoning Log
const ReasoningBlock: React.FC<{ reasoning: string }> = ({ reasoning }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="ml-2 md:ml-6 max-w-3xl relative animate-fade-in my-2">
        <div className="bg-paper-200 rounded-sm border-l-4 border-paper-500 shadow-sm overflow-hidden transition-all duration-200">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 bg-paper-200 hover:bg-paper-300/50 transition-colors border-b border-paper-400/20 group"
            >
                <div className="flex items-center gap-3">
                    <span className={`text-paper-600 transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </span>
                    <span className="uppercase tracking-widest text-[10px] font-bold text-paper-800 group-hover:text-ink-blue transition-colors">Archivist's Field Notes</span>
                </div>
                <span className="text-[9px] font-mono text-paper-500 uppercase opacity-60 group-hover:opacity-100">{isOpen ? 'Close Log' : 'View Reasoning'}</span>
            </button>
            
            {isOpen && (
                <div className="p-5 bg-paper-200/30 border-t border-paper-400/10 max-h-96 overflow-y-auto">
                     <div className="prose prose-sm max-w-none font-mono text-xs text-paper-800 leading-relaxed">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Custom styling for markdown elements within the mono-font log
                            h1: ({node, ...props}) => <h1 className="text-sm font-bold uppercase tracking-wider mt-2 mb-1" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-xs font-bold uppercase tracking-wide mt-2 mb-1" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-[11px] font-bold uppercase tracking-wide mt-2 mb-1 text-ink-blue" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 my-2" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-4 space-y-1 my-2" {...props} />,
                            li: ({node, ...props}) => <li className="pl-1" {...props} />,
                            strong: ({node, ...props}) => <strong className="font-bold text-paper-900" {...props} />,
                            blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-paper-400 pl-2 italic opacity-80 my-2" {...props} />
                          }}
                        >
                          {reasoning}
                        </ReactMarkdown>
                     </div>
                </div>
            )}
        </div>
    </div>
  );
};

// Internal AudioPlayer Component
const AudioPlayer: React.FC<{ audioData: string }> = ({ audioData }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handlePlay = async () => {
    if (isPlaying) {
      // Stop logic
      if (sourceRef.current) {
        sourceRef.current.stop();
        sourceRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Decode Base64 to Raw PCM bytes
      const rawBytes = decode(audioData);
      
      // Decode raw PCM to AudioBuffer
      const audioBuffer = await decodeAudioData(rawBytes, ctx, 24000, 1);

      // Play
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
      
      sourceRef.current = source;
      setIsPlaying(true);
    } catch (e) {
      console.error("Playback error:", e);
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    return () => {
       // Cleanup on unmount
       if (sourceRef.current) sourceRef.current.stop();
       if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return (
    <button 
      onClick={handlePlay}
      className={`flex items-center gap-3 px-4 py-3 rounded-sm border-2 font-mono text-xs font-bold uppercase tracking-widest transition-all ${isPlaying ? 'bg-ink-red border-ink-red text-white' : 'bg-paper-100 border-paper-500 text-paper-900 hover:bg-paper-50'}`}
    >
      {isPlaying ? (
        <>
          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          Stop Transmission
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Play Audio Spark
        </>
      )}
    </button>
  );
};


const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
    messages, 
    onSendMessage, 
    onGenerateHypotheses, 
    onCritique, 
    onMethodologyTransfer, 
    onGenerateExperiment,
    onGenerateMatrix,
    onAddToKnowledgeBase, 
    isTyping, 
    filesCount 
}) => {
  const [input, setInput] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [searchStatusIndex, setSearchStatusIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const searchStatuses = [
    "Connecting to Google Index...",
    "Querying External Databases...",
    "Filtering Relevant Sources...",
    "Synthesizing Search Findings...",
    "Verifying Citations..."
  ];

  useEffect(() => {
    let interval: number;
    if (isTyping && useSearch) {
      interval = window.setInterval(() => {
        setSearchStatusIndex(prev => (prev + 1) % searchStatuses.length);
      }, 1500);
    } else {
      setSearchStatusIndex(0);
    }
    return () => clearInterval(interval);
  }, [isTyping, useSearch]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input, useSearch);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleDownload = (content: string, timestamp: number) => {
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = `research-report-${new Date(timestamp).toISOString().slice(0,10)}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const parseMessageContent = (text: string) => {
    const startTag = '<reasoning>';
    const endTag = '</reasoning>';
    const startIndex = text.indexOf(startTag);
    if (startIndex === -1) return { reasoning: null, content: text };
    const endIndex = text.indexOf(endTag);
    if (endIndex !== -1) {
      const reasoning = text.substring(startIndex + startTag.length, endIndex).trim();
      const content = text.substring(endIndex + endTag.length).trim();
      return { reasoning, content };
    } else {
      const reasoning = text.substring(startIndex + startTag.length).trim();
      return { reasoning, content: '' };
    }
  };

  const hasHistory = messages.length > 0;
  const hasInput = input.trim().length > 0;
  
  // Unlock some features if we have files OR history OR active input
  const canInteract = (filesCount > 0 || hasHistory || hasInput) && !isTyping && !useSearch;
  // Specific check for things that ideally need files, but we allow if search is on
  const canDeepSearch = (filesCount > 0 || useSearch) && !isTyping; 

  const handleToolWithInput = (callback: (text: string | undefined, useSearch: boolean) => void) => {
      callback(input || undefined, useSearch);
      if (input.trim()) setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  return (
    <div className="flex-1 flex flex-col h-full relative z-10">
      {/* Header */}
      <div className="h-20 border-b border-paper-400 flex items-center px-8 justify-between bg-paper-200 shadow-sm relative">
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-paper-500 opacity-20"></div>
        <div>
           <h2 className="text-2xl font-display font-bold text-paper-900">Research Log</h2>
           <p className="text-xs font-mono text-paper-800 tracking-wider opacity-80 font-medium">
             {filesCount} DOCUMENTS SECURED // ACCESS LEVEL 3
           </p>
        </div>
        <div className="flex gap-2 items-center">
             <div className={`px-4 py-1.5 border-2 rounded-sm text-xs font-mono font-bold uppercase tracking-widest shadow-sm transform -rotate-1 transition-colors ${useSearch ? 'border-ink-blue bg-paper-100 text-ink-blue' : 'border-paper-500 bg-paper-300 text-paper-900'}`}>
                {useSearch ? 'Gemini 3 Pro + Search' : 'Gemini 3 Pro'}
             </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-10 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-60">
            <div className="w-32 h-32 border-4 border-paper-400 rounded-full flex items-center justify-center mb-6">
                <span className="text-6xl font-display text-paper-600 font-bold">?</span>
            </div>
            <p className="text-3xl font-display text-paper-900 italic font-bold">"The archives are open..."</p>
            <p className="text-base font-mono text-paper-800 mt-4 max-w-md text-center font-medium">
              Submit your inquiry or use the Neural Tools below for advanced synthesis.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const { reasoning, content } = msg.role === 'model' ? parseMessageContent(msg.text) : { reasoning: null, content: msg.text };
            
            return (
            <div key={msg.id} className={`flex w-full flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              
              {/* User Message */}
              {msg.role === 'user' && (
                <div className="max-w-2xl bg-paper-100 border border-paper-400 p-6 shadow-[2px_4px_10px_rgba(0,0,0,0.05)] relative transform rotate-1">
                  <div className="absolute -top-3 left-1/2 w-4 h-4 rounded-full bg-paper-400 shadow-sm border border-paper-500 z-10"></div>
                  <div className="prose font-serif text-lg leading-relaxed text-paper-900 font-medium">
                    <ReactMarkdown>{content}</ReactMarkdown>
                  </div>
                  <div className="mt-4 pt-2 border-t border-paper-300 flex justify-between items-center">
                    <span className="text-[10px] font-mono text-paper-600 uppercase tracking-widest font-bold">Inquiry</span>
                    <span className="text-[10px] font-mono text-paper-600 font-bold">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              )}

              {/* Model Message */}
              {msg.role === 'model' && (
                <div className="w-full max-w-4xl space-y-6">
                  {reasoning && <ReasoningBlock reasoning={reasoning} />}

                  {(content || msg.groundingMetadata || msg.audioData) && (
                    <div className="bg-paper-50 p-8 shadow-[0_4px_20px_rgba(0,0,0,0.08)] border-t-2 border-ink-red relative animate-fade-in-up group">
                        
                        {content && (
                           <>
                             {/* Download / Actions Toolbar */}
                              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                  <button onClick={() => handleDownload(content, msg.timestamp)} className="bg-paper-200 border border-paper-500 text-paper-800 p-2 rounded-sm shadow-sm hover:bg-white" title="Download Markdown">
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                  </button>
                                  <button onClick={() => onAddToKnowledgeBase(content, `Deep-Analysis-${msg.id.slice(-4)}.pdf`)} className="bg-paper-200 border border-paper-500 text-ink-red p-2 rounded-sm shadow-sm hover:bg-white" title="Export PDF & Index to Archives">
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                  </button>
                              </div>

                              <div className="prose max-w-none font-serif text-lg text-paper-900 leading-loose">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                              </div>
                           </>
                        )}
                        
                        {/* Audio Player for TTS */}
                        {msg.audioData && (
                          <div className="mt-8 pt-6 border-t border-paper-300 border-dashed">
                             <h4 className="text-xs font-bold font-display text-paper-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                               <svg className="w-4 h-4 text-ink-blue" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                               Audio Explanation
                             </h4>
                             <div className="bg-paper-200 p-4 rounded-sm border border-paper-400 flex flex-col gap-3">
                                {msg.audioScript && (
                                   <div className="text-sm font-serif italic text-paper-800 border-l-2 border-paper-400 pl-3 mb-2">
                                     "{msg.audioScript}"
                                   </div>
                                )}
                                <div>
                                   <AudioPlayer audioData={msg.audioData} />
                                </div>
                             </div>
                          </div>
                        )}

                        {/* Grounding Sources (Google Search) */}
                        {msg.groundingMetadata?.groundingChunks && msg.groundingMetadata.groundingChunks.length > 0 && (
                          <div className="mt-8 pt-6 border-t border-paper-300 border-dashed">
                            <div className="flex items-center gap-2 mb-3">
                              <svg className="w-4 h-4 text-ink-blue" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                              <p className="text-xs font-bold font-display text-ink-blue uppercase tracking-widest">Web Sources</p>
                            </div>
                            <div className="flex flex-col gap-2">
                              {msg.groundingMetadata.groundingChunks.map((chunk, idx) => (
                                chunk.web?.uri ? (
                                  <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group p-2 hover:bg-paper-100 rounded-sm transition-colors border border-transparent hover:border-paper-300">
                                    <span className="w-5 h-5 flex items-center justify-center bg-paper-300 text-paper-800 text-[10px] font-bold rounded-full font-mono">{idx + 1}</span>
                                    <span className="text-sm font-serif text-ink-blue underline decoration-dotted underline-offset-4 group-hover:text-ink-red truncate">
                                      {chunk.web.title || chunk.web.uri}
                                    </span>
                                  </a>
                                ) : null
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Internal References (RAG) */}
                        {msg.references && msg.references.length > 0 && !msg.groundingMetadata && (
                        <div className="mt-8 pt-6 border-t border-paper-300 border-dashed">
                            <p className="text-xs font-bold font-display text-paper-600 uppercase tracking-widest mb-3">Internal Archive Sources</p>
                            <div className="flex flex-wrap gap-3">
                            {msg.references.map((ref, idx) => (
                                <span key={idx} className="inline-flex items-center px-3 py-1 bg-paper-100 border border-paper-400 text-xs font-mono text-paper-900 font-semibold hover:bg-white transition-colors cursor-help" title={ref.textSnippet.substring(0, 150) + '...'}>
                                <span className="w-1.5 h-1.5 bg-ink-red rounded-full mr-2 opacity-80"></span>
                                {ref.fileName}
                                </span>
                            ))}
                            </div>
                        </div>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })
        )}
        
        {/* Loading Indicator */}
        {isTyping && !messages[messages.length - 1]?.text && !messages[messages.length - 1]?.audioData && (
            <div className="flex justify-start ml-10">
                 <div className="flex items-center gap-3 text-paper-600 font-mono text-xs uppercase tracking-widest font-bold">
                    {useSearch ? (
                      <>
                        <svg className="w-4 h-4 animate-spin text-ink-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="text-ink-blue animate-pulse">{searchStatuses[searchStatusIndex]}</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 bg-paper-600 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-paper-600 rounded-full animate-bounce delay-75"></span>
                        <span className="w-2 h-2 bg-paper-600 rounded-full animate-bounce delay-150"></span>
                        <span>Retrieving from archives...</span>
                      </>
                    )}
                 </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-paper-300 border-t border-paper-400 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
          
          <div className="w-full bg-paper-50 border-2 border-paper-400 focus-within:border-paper-600 focus-within:shadow-md transition-all rounded-sm flex flex-col relative group">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={useSearch ? "Search the web for insights..." : (filesCount > 0 ? "Ask the archives..." : "Start a log or upload documents.")}
              disabled={isTyping}
              className="w-full pl-5 pr-5 pt-5 pb-3 bg-transparent border-none focus:ring-0 resize-none font-serif text-lg text-paper-900 placeholder-paper-400 min-h-[60px] max-h-[200px] overflow-y-auto"
              rows={1}
            />
            
            {/* Toolbar */}
            <div className="px-3 pb-3 pt-1 flex items-center justify-between">
               
               {/* Left Tools */}
               <div className="flex items-center gap-1">
                  
                  {/* Web Search Button */}
                  <div className="relative group/tooltip">
                    <button
                        type="button"
                        onClick={() => setUseSearch(!useSearch)}
                        disabled={isTyping}
                        className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center border border-transparent ${useSearch ? 'bg-ink-blue text-paper-50 shadow-sm' : 'text-paper-500 hover:text-ink-blue hover:bg-paper-200'}`}
                    >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] font-mono font-bold text-paper-100 bg-paper-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                        {useSearch ? 'Disable Web Search' : 'Enable Web Search'}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-paper-900"></div>
                    </div>
                  </div>

                  {/* 1. Systematic Review Matrix Builder */}
                  <div className="relative group/tooltip">
                    <button
                        type="button"
                        onClick={() => handleToolWithInput(onGenerateMatrix)}
                        disabled={!canInteract}
                        className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center border border-transparent ${
                             !canInteract
                             ? 'text-paper-300 cursor-not-allowed' 
                             : 'text-paper-500 hover:text-indigo-700 hover:bg-paper-200'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7-4h14M4 6h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" /></svg>
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] font-mono font-bold text-paper-100 bg-paper-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                        Synthesize Matrix
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-paper-900"></div>
                    </div>
                  </div>

                  {/* 2. Critique / Adversarial Review */}
                  <div className="relative group/tooltip">
                    <button
                        type="button"
                        onClick={() => handleToolWithInput(onCritique)}
                        disabled={!canInteract}
                        className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center border border-transparent ${
                             !canInteract
                             ? 'text-paper-300 cursor-not-allowed' 
                             : 'text-paper-500 hover:text-ink-red hover:bg-paper-200'
                        }`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] font-mono font-bold text-paper-100 bg-paper-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                        Peer Review (Critique)
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-paper-900"></div>
                    </div>
                  </div>

                  {/* 3. Methodology Transfer */}
                  <div className="relative group/tooltip">
                    <button
                        type="button"
                        onClick={() => onMethodologyTransfer(useSearch)}
                        disabled={!canDeepSearch}
                        className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center border border-transparent ${
                             !canDeepSearch
                             ? 'text-paper-300 cursor-not-allowed' 
                             : 'text-paper-500 hover:text-amber-700 hover:bg-paper-200'
                        }`}
                    >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] font-mono font-bold text-paper-100 bg-paper-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                        Lateral Methodology Transfer
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-paper-900"></div>
                    </div>
                  </div>

                  {/* 4. Experiment / Protocol */}
                  <div className="relative group/tooltip">
                    <button
                        type="button"
                        onClick={() => handleToolWithInput(onGenerateExperiment)}
                        disabled={!canInteract}
                        className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center border border-transparent ${
                             !canInteract
                             ? 'text-paper-300 cursor-not-allowed' 
                             : 'text-paper-500 hover:text-green-700 hover:bg-paper-200'
                        }`}
                    >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] font-mono font-bold text-paper-100 bg-paper-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                        Generate Lab Protocol
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-paper-900"></div>
                    </div>
                  </div>

                  {/* 5. Novel Hypotheses */}
                  <div className="relative group/tooltip">
                    <button
                        type="button"
                        onClick={() => onGenerateHypotheses(useSearch)}
                        disabled={!canDeepSearch}
                        className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center border border-transparent ${
                             !canDeepSearch
                             ? 'text-paper-300 cursor-not-allowed' 
                             : 'text-paper-500 hover:text-purple-700 hover:bg-paper-200'
                        }`}
                    >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                    </button>
                     <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] font-mono font-bold text-paper-100 bg-paper-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                        Novel Hypotheses Protocol
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-paper-900"></div>
                    </div>
                  </div>

               </div>

               {/* Right Tools: Send Button */}
                <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className={`p-2 rounded-md transition-all duration-200 flex items-center justify-center ${
                        !input.trim() || isTyping
                        ? 'text-paper-300 cursor-not-allowed bg-paper-100'
                        : 'bg-paper-800 text-paper-50 hover:bg-paper-900 shadow-sm'
                    }`}
                >
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                     </svg>
                </button>

            </div>
          </div>
          
          <div className="flex justify-between px-1">
             <span className="text-[10px] font-mono text-paper-500 font-bold uppercase tracking-widest opacity-60">
                 {useSearch ? 'Connected to Global Network' : `Local Archives: ${filesCount} Files`}
             </span>
             {isTyping && <span className="text-[10px] font-mono text-ink-blue animate-pulse">Processing...</span>}
          </div>

        </form>
      </div>
    </div>
  );
};

export default ChatInterface;