import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import GraphView from './components/GraphView';
import RoundTableInterface from './components/RoundTableInterface';
import { UploadedFile, Message, SearchResult } from './types';
import { extractContentFromFile, extractMetadata, generateEmbedding } from './services/geminiService';
import { addDocumentToStore, searchVectorStore, clearStore, deleteDocumentFromStore } from './services/vectorStore';
import { 
  generateRagResponseStream, 
  generateSearchResponseStream, 
  generateAudioOverview, 
  generateHypothesesStream,
  generateCritiqueStream,
  generateMethodologyTransferStream,
  generateExperimentStream,
  generateRoundTableStream,
  generateMatrixStream
} from './services/geminiService';
import { generateId } from './utils/fileHelpers';
import { generatePdfBlob } from './utils/pdfHelpers';

type ViewMode = 'chat' | 'graph' | 'roundtable';

const App: React.FC = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  // Standard Chat History
  const [messages, setMessages] = useState<Message[]>([]);
  // Round Table Chat History
  const [roundTableMessages, setRoundTableMessages] = useState<Message[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<ViewMode>('chat');

  useEffect(() => {
    clearStore();
  }, []);

  const processSingleFile = async (file: UploadedFile) => {
    // If already processed, skip
    if (file.processed || file.processingError) return;

    try {
      // 1. Text Extraction (Must happen first)
      let extractedText = "";
      if (file.type === 'text/plain') {
            extractedText = atob(file.content);
      } else {
            extractedText = await extractContentFromFile(file);
      }

      // 2. Parallel Processing
      // Once we have text, we can run Metadata extraction, Graph Embedding, and Vector Indexing simultaneously.
      // This massively reduces wait time.
      const [metadata, embedding, _] = await Promise.all([
          extractMetadata(extractedText.slice(0, 30000), file.name), // Increased context window for metadata
          generateEmbedding(extractedText.slice(0, 2000)), // Fast embedding for graph
          addDocumentToStore(file.id, file.id, file.name, extractedText) // Batch indexing
      ]);
      
      // UPDATE STATE FUNCTIONALLY
      setFiles(currentFiles => 
        currentFiles.map(f => 
          f.id === file.id 
          ? { ...f, processed: true, extractedText, metadata, embedding } 
          : f
        )
      );
    } catch (error) {
      console.error(`Error processing ${file.name}:`, error);
      setFiles(currentFiles => 
        currentFiles.map(f => 
          f.id === file.id 
          ? { ...f, processingError: "Archival failed." } 
          : f
        )
      );
    }
  };

  const handleFileUpload = async (newFiles: UploadedFile[]) => {
    // 1. Add placeholders immediately
    setFiles(prev => [...prev, ...newFiles]);
    setIsProcessing(true);

    // 2. Process all new files in parallel (Concurrent execution)
    // We do NOT await the Promise.all here because we want the UI to remain responsive 
    // and updates to happen one by one as they finish.
    const processingPromises = newFiles.map(file => processSingleFile(file));

    // 3. Wait for all to finish only to toggle the global isProcessing flag
    Promise.allSettled(processingPromises).then(() => {
      setIsProcessing(false);
    });
  };

  const handleRemoveFile = (fileId: string) => {
    deleteDocumentFromStore(fileId);
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleGenerateAudio = async (file: UploadedFile) => {
    setCurrentView('chat');
    setIsTyping(true);

    // User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: `**REQUEST:** Generate Audio Spark (Podcast Summary).\n**TARGET:** ${file.name}`,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);

    const modelMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
        id: modelMsgId,
        role: 'model',
        text: `Synthesizing audio overview for **${file.name}**. Please stand by...`,
        timestamp: Date.now()
    }]);

    try {
      const { audioData, script } = await generateAudioOverview(file);

      setMessages(prev => prev.map(msg => 
        msg.id === modelMsgId 
        ? { 
            ...msg, 
            text: `Audio Spark generated successfully for **${file.name}**.`, 
            audioData,
            audioScript: script
          } 
        : msg
      ));
    } catch (error) {
      console.error("Audio Generation Error", error);
      setMessages(prev => prev.map(msg => 
        msg.id === modelMsgId 
        ? { ...msg, text: "Failed to generate audio summary. Please try again." } 
        : msg
      ));
    } finally {
      setIsTyping(false);
    }
  };

  // Helper for all specialized generation tasks to reduce duplication
  const runSpecializedTask = async (
    userText: string,
    generatorFunc: (...args: any[]) => AsyncGenerator<any, void, unknown>,
    args: any[]
  ) => {
    setCurrentView('chat');
    setIsTyping(true);
    
    // Add User Request
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Add Model Placeholder
      const modelMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: modelMsgId,
        role: 'model',
        text: '',
        timestamp: Date.now()
      }]);

      const stream = generatorFunc(...args);
      let fullText = '';

      for await (const chunk of stream) {
        fullText += chunk.text;
        
        setMessages(prev => prev.map(msg => {
            if (msg.id !== modelMsgId) return msg;
            
            const updatedMsg = { ...msg, text: fullText };
            if (chunk.groundingMetadata) {
                updatedMsg.groundingMetadata = chunk.groundingMetadata;
            }
            return updatedMsg;
        }));
      }

    } catch (error) {
      console.error("Task Error:", error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        role: 'model',
        text: "The protocol encountered an error.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateHypotheses = (useSearch: boolean) => {
    if (files.filter(f => f.processed).length === 0 && !useSearch) return;
    runSpecializedTask(
      "**REQUEST:** Initiate Novel Hypotheses Protocol.\n**TARGET:** Generate novel hypotheses.",
      generateHypothesesStream,
      [files, useSearch]
    );
  };

  const handleCritique = (inputText: string | undefined, useSearch: boolean) => {
    const userText = inputText 
        ? `**REQUEST:** Initiate Adversarial Peer Review.\n**CONTEXT:** ${inputText}`
        : "**REQUEST:** Initiate Adversarial Peer Review.\n**TARGET:** Critique conversation history and findings.";
    
    const pendingMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        text: userText,
        timestamp: Date.now()
    };
    const updatedHistory = [...messages, pendingMsg];

    runSpecializedTask(
      userText,
      generateCritiqueStream,
      [updatedHistory, files, useSearch]
    );
  };

  const handleMethodologyTransfer = (useSearch: boolean) => {
    runSpecializedTask(
      "**REQUEST:** Initiate Lateral Methodology Transfer.\n**TARGET:** Apply methods from one domain to another.",
      generateMethodologyTransferStream,
      [files, useSearch]
    );
  };

  const handleGenerateExperiment = (inputText: string | undefined, useSearch: boolean) => {
    const userText = inputText
        ? `**REQUEST:** Initiate Protocol Genesis.\n**IDEA:** ${inputText}`
        : "**REQUEST:** Initiate Protocol Genesis.\n**TARGET:** Convert recent hypothesis into experimental design.";

    const pendingMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        text: userText,
        timestamp: Date.now()
    };
    const updatedHistory = [...messages, pendingMsg];

    runSpecializedTask(
      userText,
      generateExperimentStream,
      [updatedHistory, useSearch]
    );
  };

  const handleRoundTableMessage = async (text: string, useSearch: boolean) => {
    setIsTyping(true);
    
    // 1. Add User Message to RT History
    const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        text,
        timestamp: Date.now()
    };
    setRoundTableMessages(prev => [...prev, userMsg]);

    try {
        // 2. Add Model Placeholder
        const modelMsgId = (Date.now() + 1).toString();
        setRoundTableMessages(prev => [...prev, {
            id: modelMsgId,
            role: 'model',
            text: '',
            timestamp: Date.now()
        }]);

        // 3. Run Stream (Using the full RT history + Files)
        // Note: passing roundTableMessages as history
        const stream = generateRoundTableStream(
            [...roundTableMessages, userMsg], 
            files, 
            useSearch
        );
        
        let fullText = '';
        for await (const chunk of stream) {
            fullText += chunk.text;
            setRoundTableMessages(prev => prev.map(msg => {
                if (msg.id !== modelMsgId) return msg;
                const updatedMsg = { ...msg, text: fullText };
                if (chunk.groundingMetadata) {
                  updatedMsg.groundingMetadata = chunk.groundingMetadata;
                }
                return updatedMsg;
            }));
        }

    } catch (e) {
        console.error(e);
    } finally {
        setIsTyping(false);
    }
  };

  const handleGenerateMatrix = (inputText: string | undefined, useSearch: boolean) => {
      const variables = inputText || "Sample Size, Methodology, Key Findings, p-Value, Limitations";
      const userText = `**REQUEST:** Build Systematic Review Matrix.\n**VARIABLES:** ${variables}`;

      runSpecializedTask(
          userText,
          generateMatrixStream,
          [variables, files, useSearch]
      );
  };

  const handleSendMessage = async (text: string, useSearch: boolean) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: Date.now()
    };
    
    // Capture history
    const currentHistory = messages;

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const contextResults: SearchResult[] = await searchVectorStore(text);
      
      const modelMsgId = (Date.now() + 1).toString();
      
      // Initialize empty model message
      setMessages(prev => [...prev, {
        id: modelMsgId,
        role: 'model',
        text: '',
        timestamp: Date.now(),
        references: useSearch ? undefined : contextResults
      }]);

      // Choose stream based on mode
      const stream = useSearch 
        ? generateSearchResponseStream(text, contextResults, currentHistory)
        : generateRagResponseStream(text, contextResults, currentHistory);
      
      let fullText = '';

      for await (const chunk of stream) {
        fullText += chunk.text;
        
        setMessages(prev => prev.map(msg => {
          if (msg.id !== modelMsgId) return msg;
          
          const updatedMsg = { ...msg, text: fullText };
          // If search metadata comes in, attach it
          if (chunk.groundingMetadata) {
            updatedMsg.groundingMetadata = chunk.groundingMetadata;
          }
          return updatedMsg;
        }));
      }

    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'model',
        text: "The archives are currently inaccessible. Please try again.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleAddToKnowledgeBase = async (content: string, filename: string) => {
    // 1. Generate PDF Blob for user download (using original content for visual fidelity)
    const pdfBlob = await generatePdfBlob(content, filename.replace('.pdf', ''));
    
    // Trigger download
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 2. Re-upload as Evidence
    // PREPEND METADATA: Explicitly add metadata headers so the indexing agent 
    // knows how to attribute this document (Author, Title, Date).
    const cleanTitle = filename.replace('.pdf', '').replace(/-/g, ' ');
    const metadataHeader = `
DOCUMENT METADATA:
Title: ${cleanTitle}
Author: Gemini 3 Pro (Research Assistant)
Type: Hypothesis Protocol / Research Report
Date: ${new Date().toLocaleDateString()}
    
---
CONTENT:
`;
    const fullContent = metadataHeader + content;

    const base64Content = btoa(unescape(encodeURIComponent(fullContent))); // Safe base64 encode for UTF-8 text

    const newFile: UploadedFile = {
      id: generateId(),
      name: filename,
      type: 'text/plain', // Treat as text for easier indexing
      size: pdfBlob.size,
      content: base64Content,
      processed: false
    };

    handleFileUpload([newFile]);
  };
  
  const handleGraphDiscuss = (fileName: string) => {
    setCurrentView('chat');
    handleSendMessage(`Tell me about the findings in **${fileName}**.`, false);
  };

  return (
    <div className="flex h-screen w-full bg-paper-200 overflow-hidden font-serif text-paper-900 bg-paper-texture">
      <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')]"></div>
      
      <Sidebar 
        files={files} 
        onFileUpload={handleFileUpload} 
        onRemoveFile={handleRemoveFile}
        onGenerateAudio={handleGenerateAudio}
        isProcessing={isProcessing}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      
      {/* View Switcher Tabs (Top Right Overlay) */}
      <div className="absolute top-4 right-8 z-30 flex bg-paper-300 rounded-sm p-1 border border-paper-400 shadow-md">
          <button 
            onClick={() => setCurrentView('chat')}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-widest font-bold transition-all ${currentView === 'chat' ? 'bg-paper-800 text-paper-50 shadow-sm' : 'text-paper-800 hover:bg-paper-200'}`}
          >
            Research Log
          </button>
          <button 
            onClick={() => setCurrentView('graph')}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-widest font-bold transition-all ${currentView === 'graph' ? 'bg-ink-blue text-paper-50 shadow-sm' : 'text-paper-800 hover:bg-paper-200'}`}
          >
            Literature Map
          </button>
          <button 
            onClick={() => setCurrentView('roundtable')}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-widest font-bold transition-all ${currentView === 'roundtable' ? 'bg-purple-900 text-paper-50 shadow-sm' : 'text-paper-800 hover:bg-paper-200'}`}
          >
            Council
          </button>
      </div>

      <div className="flex-1 h-full relative z-10">
        {currentView === 'chat' && (
          <ChatInterface 
            messages={messages} 
            onSendMessage={handleSendMessage}
            onGenerateHypotheses={() => handleGenerateHypotheses(false)} 
            onCritique={handleCritique}
            onMethodologyTransfer={handleMethodologyTransfer}
            onGenerateExperiment={handleGenerateExperiment}
            onGenerateMatrix={handleGenerateMatrix}
            onAddToKnowledgeBase={handleAddToKnowledgeBase}
            isTyping={isTyping}
            filesCount={files.filter(f => f.processed).length}
          />
        )}
        
        {currentView === 'graph' && (
          <GraphView files={files} onDiscuss={handleGraphDiscuss} />
        )}

        {currentView === 'roundtable' && (
            <RoundTableInterface 
                messages={roundTableMessages}
                onSendMessage={handleRoundTableMessage}
                isTyping={isTyping}
                filesCount={files.filter(f => f.processed).length}
            />
        )}
      </div>
    </div>
  );
};

export default App;