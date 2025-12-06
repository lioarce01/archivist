import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, GroundingMetadata } from '../types';

interface RoundTableInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string, useSearch: boolean) => void;
  isTyping: boolean;
  filesCount: number;
}

interface ChatBubble {
  speaker: string;
  content: string;
}

// Helper to parse the script format into chat bubbles
const parseScriptToBubbles = (fullText: string): ChatBubble[] => {
  const regex = /\[(Dr\. V|Prof\. E|Director A|Orchestrator)\]:([\s\S]*?)(?=\[(?:Dr\. V|Prof\. E|Director A|Orchestrator)\]:|$)/g;
  const matches = [...fullText.matchAll(regex)];
  
  if (matches.length === 0) {
    // If text exists but doesn't match format (e.g. error message or initial thought), return as Orchestrator or generic
    if (fullText.trim()) {
        return [{ speaker: 'Orchestrator', content: fullText }];
    }
    return [];
  }

  return matches.map(match => ({
    speaker: match[1],
    content: match[2].trim()
  }));
};

// Component to render text with interactive citations
const ContentWithCitations: React.FC<{ content: string, groundingMetadata?: GroundingMetadata }> = ({ content, groundingMetadata }) => {
  if (!groundingMetadata?.groundingChunks || groundingMetadata.groundingChunks.length === 0) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }

  // Regex to find [1], [2], etc.
  const citationRegex = /\[(\d+)\]/g;
  const parts = content.split(citationRegex);
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Every odd index in split result is a capture group (the number)
    if (i % 2 === 1) {
      const index = parseInt(part, 10);
      const chunk = groundingMetadata.groundingChunks[index - 1]; // citations usually 1-based
      
      if (chunk && chunk.web) {
        elements.push(
          <span key={i} className="inline-flex align-top ml-0.5 mr-1 group relative">
             <a 
               href={chunk.web.uri} 
               target="_blank" 
               rel="noopener noreferrer"
               className="flex items-center justify-center w-4 h-4 rounded-full bg-ink-blue text-white text-[9px] font-bold font-mono hover:bg-ink-red transition-colors -mt-1 cursor-pointer"
               title={chunk.web.title}
             >
               {index}
             </a>
             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-48 p-2 bg-paper-900 text-paper-50 text-[10px] rounded shadow-lg z-50">
                <p className="font-bold truncate">{chunk.web.title}</p>
                <p className="opacity-70 truncate">{chunk.web.uri}</p>
             </div>
          </span>
        );
      } else {
        // Fallback if metadata mismatch
        elements.push(<sup key={i} className="text-[9px] font-bold text-paper-500">[{part}]</sup>);
      }
    } else {
      // Regular text part - render as Markdown
      if (part) {
        elements.push(<ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{p: ({children}) => <>{children}</>}}>{part}</ReactMarkdown>);
      }
    }
  }

  return <div className="inline">{elements}</div>;
};

const RoundTableInterface: React.FC<RoundTableInterfaceProps> = ({ 
    messages, 
    onSendMessage, 
    isTyping,
    filesCount
}) => {
  const [input, setInput] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const toggleSources = (msgId: string) => {
    setExpandedSources(prev => ({...prev, [msgId]: !prev[msgId]}));
  };

  const getSpeakerStyle = (speaker: string) => {
    switch (speaker) {
      case 'Dr. V':
        return {
          bg: 'bg-[#e0e7ff]', // indigo-100
          border: 'border-[#4f46e5]', // indigo-600
          text: 'text-indigo-900',
          label: 'Data Scientist',
          align: 'left',
          icon: '📊'
        };
      case 'Prof. E':
        return {
          bg: 'bg-[#dcfce7]', // green-100
          border: 'border-[#15803d]', // green-700
          text: 'text-green-900',
          label: 'Ethicist',
          align: 'left',
          icon: '🌱'
        };
      case 'Director A':
        return {
          bg: 'bg-[#f3e8ff]', // purple-100
          border: 'border-[#7e22ce]', // purple-700
          text: 'text-purple-900',
          label: 'Strategist',
          align: 'left',
          icon: '🚀'
        };
      case 'Orchestrator':
        return {
          bg: 'bg-[#fffbeb]', // amber-50
          border: 'border-[#b45309]', // amber-700
          text: 'text-amber-900',
          label: 'Moderator',
          align: 'center', // Orchestrator is centered or distinct
          icon: '⚖️'
        };
      default:
        return {
          bg: 'bg-paper-100',
          border: 'border-paper-400',
          text: 'text-paper-900',
          label: 'Unknown',
          align: 'left',
          icon: '👤'
        };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full relative z-10 bg-paper-200">
      
      {/* Header */}
      <div className="h-20 border-b border-paper-400 flex items-center px-8 justify-between bg-paper-300 shadow-sm relative z-20">
        <div>
           <h2 className="text-2xl font-display font-bold text-paper-900 flex items-center gap-2">
             <span className="text-2xl">🏛️</span> Council Chamber
           </h2>
           <p className="text-xs font-mono text-paper-800 tracking-wider opacity-80 font-medium">
             MULTI-AGENT DEBATE PROTOCOL ACTIVE
           </p>
        </div>
        <div className="flex items-center gap-4">
             {/* Avatars */}
             <div className="flex -space-x-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 border-2 border-paper-200 flex items-center justify-center text-lg shadow-sm" title="Dr. V">📊</div>
                <div className="w-10 h-10 rounded-full bg-green-100 border-2 border-paper-200 flex items-center justify-center text-lg shadow-sm" title="Prof. E">🌱</div>
                <div className="w-10 h-10 rounded-full bg-purple-100 border-2 border-paper-200 flex items-center justify-center text-lg shadow-sm" title="Director A">🚀</div>
             </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-60">
            <div className="w-32 h-32 bg-paper-300 rounded-full flex items-center justify-center mb-6 border-4 border-paper-400">
                <span className="text-6xl">⚖️</span>
            </div>
            <p className="text-2xl font-display text-paper-900 font-bold">The Council is seated.</p>
            <p className="text-base font-mono text-paper-800 mt-2 max-w-md text-center">
              Pose a complex scientific query. The agents will debate it from their unique perspectives (Data, Ethics, Strategy).
            </p>
          </div>
        ) : (
          messages.map((msg) => {
             // User Message
             if (msg.role === 'user') {
                 return (
                    <div key={msg.id} className="flex justify-end w-full animate-fade-in-up">
                         {/* CHANGED: Beige background (bg-paper-100), Dark text (text-paper-900) for readability */}
                         <div className="max-w-xl bg-paper-100 text-paper-900 border border-paper-400 p-4 rounded-tl-xl rounded-tr-xl rounded-bl-xl shadow-md">
                             <div className="prose prose-sm max-w-none font-serif text-paper-900 leading-relaxed">
                                 <ReactMarkdown>{msg.text}</ReactMarkdown>
                             </div>
                         </div>
                    </div>
                 );
             }

             // Model Message (Parsed into bubbles)
             const bubbles = parseScriptToBubbles(msg.text);

             return (
                 <div key={msg.id} className="space-y-4 w-full max-w-4xl mx-auto">
                     {bubbles.map((bubble, idx) => {
                         const style = getSpeakerStyle(bubble.speaker);
                         const isOrchestrator = bubble.speaker === 'Orchestrator';

                         return (
                             <div key={idx} className={`flex w-full animate-fade-in ${isOrchestrator ? 'justify-center' : 'justify-start'}`}>
                                 <div className={`
                                     relative p-5 rounded-lg shadow-sm border-l-4 max-w-2xl
                                     ${style.bg} ${style.border}
                                     ${isOrchestrator ? 'w-full shadow-lg border-t-4 border-l-0' : ''}
                                 `}>
                                     {/* Speaker Header */}
                                     <div className={`flex items-center gap-2 mb-2 ${isOrchestrator ? 'justify-center border-b border-paper-900/10 pb-2' : ''}`}>
                                         <span className="text-xl">{style.icon}</span>
                                         <span className={`font-display font-bold text-sm ${style.text}`}>{bubble.speaker}</span>
                                         <span className="text-[10px] font-mono uppercase opacity-60 tracking-widest text-black/60 bg-white/30 px-1 rounded">
                                             {style.label}
                                         </span>
                                     </div>
                                     
                                     {/* Content */}
                                     <div className={`prose prose-sm max-w-none font-serif leading-relaxed text-paper-900`}>
                                        <ContentWithCitations content={bubble.content} groundingMetadata={msg.groundingMetadata} />
                                     </div>
                                 </div>
                             </div>
                         );
                     })}
                     
                     {/* Collapsible Source Panel */}
                     {msg.groundingMetadata?.groundingChunks && msg.groundingMetadata.groundingChunks.length > 0 && (
                        <div className="flex justify-center animate-fade-in mt-4">
                            <div className="bg-paper-200 border border-paper-400 rounded-sm shadow-sm max-w-2xl w-full overflow-hidden transition-all duration-300">
                                <button 
                                    onClick={() => toggleSources(msg.id)}
                                    className="w-full flex items-center justify-between p-3 bg-paper-300/50 hover:bg-paper-300 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <svg className="w-3 h-3 text-ink-blue" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-ink-blue">Council References ({msg.groundingMetadata.groundingChunks.length})</span>
                                    </div>
                                    <span className="text-paper-600">
                                        <svg className={`w-4 h-4 transform transition-transform ${expandedSources[msg.id] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </span>
                                </button>
                                
                                {expandedSources[msg.id] && (
                                    <div className="p-3 bg-paper-100 border-t border-paper-300">
                                        <div className="grid grid-cols-1 gap-2">
                                            {msg.groundingMetadata.groundingChunks.map((chunk, idx) => (
                                                chunk.web?.uri ? (
                                                    <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 group p-2 hover:bg-white rounded transition-colors border border-transparent hover:border-paper-300">
                                                        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-ink-blue text-white text-[10px] font-bold rounded-full font-mono mt-0.5">{idx + 1}</span>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold font-serif text-paper-900 leading-tight group-hover:text-ink-blue transition-colors">
                                                                {chunk.web.title || "Untitled Source"}
                                                            </p>
                                                            <p className="text-[10px] font-mono text-paper-500 truncate mt-0.5">
                                                                {chunk.web.uri}
                                                            </p>
                                                        </div>
                                                    </a>
                                                ) : null
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                     )}

                     {/* If empty/loading and typing */}
                     {bubbles.length === 0 && isTyping && (
                         <div className="flex justify-center">
                             <span className="text-xs font-mono animate-pulse text-paper-500">The Council is deliberating...</span>
                         </div>
                     )}
                 </div>
             );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-paper-300 border-t border-paper-400 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] relative z-20">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
          
          <div className="w-full bg-paper-50 border-2 border-paper-400 focus-within:border-paper-600 focus-within:shadow-md transition-all rounded-sm flex flex-col relative group">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Present a topic for debate..."
              disabled={isTyping}
              className="w-full pl-5 pr-5 pt-5 pb-3 bg-transparent border-none focus:ring-0 resize-none font-serif text-lg text-paper-900 placeholder-paper-400 min-h-[60px] max-h-[200px] overflow-y-auto"
              rows={1}
            />
            
            <div className="px-3 pb-3 pt-1 flex items-center justify-between">
               
               {/* Left Tools - Web Search Toggle */}
               <div className="flex items-center gap-1">
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
                        {useSearch ? 'Disable Live Data' : 'Enable Live Data'}
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
        </form>
      </div>
    </div>
  );
};

export default RoundTableInterface;