import { GoogleGenAI, Type, Modality } from "@google/genai";
import { UploadedFile, SearchResult, FileType, DocumentMetadata, GroundingMetadata, Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// STRICT ENFORCEMENT: All intelligence tasks must use Gemini 3 Pro as requested.
const INTELLIGENCE_MODEL = "gemini-3-pro-preview"; 
const TTS_MODEL = "gemini-2.5-flash-preview-tts"; // Specialized model for Audio generation only
const EMBEDDING_MODEL = "text-embedding-004";

// Helper to ensure all agents know the date
const getCurrentDate = () => new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// Helper to safely parse JSON from LLM output, handling potential markdown fences
const cleanAndParseJson = <T>(text: string): T | null => {
  try {
    // Remove ```json and ``` fences, and trim whitespace
    let cleanText = text.replace(/```json\n?|```/g, "").trim();
    // Occasionally models add textual prefixes even with JSON mode
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleanText) as T;
  } catch (error) {
    console.warn("Failed to parse JSON response:", error);
    return null;
  }
};

export interface StreamResponse {
  text: string;
  groundingMetadata?: GroundingMetadata;
}

export const extractContentFromFile = async (file: UploadedFile): Promise<string> => {
  try {
    // Enhanced prompt for maximum fidelity and structural awareness
    const prompt = `
      IDENTITY: You are a Polymathic Archive Intelligence, capable of perceiving the deepest structural and semantic layers of scientific documentation.
      CURRENT DATE: ${getCurrentDate()}
      
      OBJECTIVE: Construct a "Lossless Semantic Digital Twin" of the provided document, prioritizing the preservation of complex scientific data structures.

      PHASE 1: LAYOUT & FLOW ANALYSIS
      *   **Columnar Logic**: Deconstruct multi-column layouts into a single linear reading stream. Never read across columns.
      *   **Linguistic Reconstruction**: Repair hyphenated words (e.g., "neu- ral" -> "neural") and normalize spacing.
      *   **Noise Filtering**: Surgically remove non-semantic artifacts (running headers, page numbers, footer boilerplate).

      PHASE 2: DATA STRUCTURE EXTRACTION
      *   **Tabular Data**: Convert tables into clean, aligned Markdown tables. If a cell spans rows/cols, unroll the data to ensure every row is self-contained and semantically complete.
      *   **Mathematics**: Transcribe all equations into LaTeX format (e.g., $E=mc^2$).

      PHASE 3: MULTIMODAL INTERPRETATION (VISUALS)
      *   For EVERY chart, graph, diagram, or micrograph, insert a semantic block:
          > **[Visual Entity: Figure N]**
          > *Type:* [e.g., t-SNE Plot, Western Blot, Circuit Diagram]
          > *Caption:* [Exact text]
          > *Data Narrative:* Extract the underlying data trends. (e.g., "Curve A peaks at t=5s with value 0.8").
          > *Scientific Implication:* Why does this figure exist? What hypothesis does it prove or disprove?

      PHASE 4: STRUCTURAL HIERARCHY
      *   Map the document's logical tree (Abstract -> Intro -> Methods...) using Markdown headers (#, ##).

      OUTPUT:
      Return ONLY the processed Markdown text. No preamble.
    `;

    const response = await ai.models.generateContent({
      model: INTELLIGENCE_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: file.type, data: file.content } },
          { text: prompt }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Error extracting content:", error);
    throw new Error("Failed to process file content.");
  }
};

export const extractMetadata = async (text: string, fileName: string): Promise<DocumentMetadata> => {
  try {
    if (!text || text.length < 50) {
        console.warn("Text content too short for metadata extraction");
        return { title: fileName, authors: [], topics: [], year: "n.d.", summary: "Insufficient text content extracted for summary generation." };
    }

    // Upgraded prompt for deeper semantic tagging using Gemini 3 Pro
    const prompt = `
      IDENTITY: Senior Bibliometric Data Scientist & Ontology Architect.
      CURRENT DATE: ${getCurrentDate()}
      
      TASK: Extract high-precision metadata and construct a semantic profile for the provided text.
      
      INPUT TEXT FROM "${fileName}":
      ${text.slice(0, 30000)} 
      
      DIRECTIVES:
      1.  **Attribution**: Locate Title, Authors, and Publication Year with forensic accuracy. If a "DOCUMENT METADATA" block exists, it is the source of truth.
      2.  **Semantic Tagging**: Do not just list keywords. Identify 5-7 "Macro-Topics" that represent the *intersection* of fields (e.g., instead of "AI" and "Biology", use "Computational Protein Folding").
      3.  **Executive Synthesis**: Write a "Result-First" summary. Start immediately with the primary discovery or claim. (e.g., "This study demonstrates that X increases Y by 50%..."). 
      4.  **Visual Integration**: If the text describes visuals, weave their implications into the summary.

      OUTPUT FORMAT:
      Return ONLY a raw JSON object. Do not wrap in markdown code blocks.
      JSON SCHEMA:
      {
        "title": "string",
        "authors": ["string"], // Array of strings
        "year": "string",
        "topics": ["string"], // Array of strings
        "summary": "string"
      }
    `;

    const response = await ai.models.generateContent({
      model: INTELLIGENCE_MODEL, // Upgraded to 3 Pro
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // REMOVED explicit responseSchema to handle potential schema mismatches more gracefully.
        // The prompt and MIME type are sufficient for 3-Pro.
      }
    });

    if (response.text) {
        const metadata = cleanAndParseJson<DocumentMetadata>(response.text);
        if (metadata) {
            // Validate essential fields
            return {
                title: metadata.title || fileName,
                authors: Array.isArray(metadata.authors) ? metadata.authors : [],
                year: metadata.year || "n.d.",
                topics: Array.isArray(metadata.topics) ? metadata.topics : [],
                summary: metadata.summary || "No summary generated."
            };
        }
    }
    return { title: fileName, authors: [], topics: [], year: "n.d.", summary: "Metadata extraction failed." };
  } catch (e) {
    console.error("Metadata extraction failed", e);
    return { title: fileName, authors: [], topics: [], year: "n.d.", summary: "Metadata extraction failed." };
  }
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text.slice(0, 9000), 
    });
    if (response.embeddings?.[0]?.values) {
        return response.embeddings[0].values;
    }
    throw new Error("Invalid embedding response structure");
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
};

// NEW: Batch Embedding for High Speed Indexing
export const generateBatchEmbeddings = async (texts: string[]): Promise<number[][]> => {
  try {
    // Use parallel execution since batchEmbedContents is not available in the current SDK types
    const promises = texts.map(async (text) => {
      try {
        return await generateEmbedding(text);
      } catch (e) {
        console.warn("Embedding failed for text chunk", e);
        return [];
      }
    });
    
    return await Promise.all(promises);
  } catch (error) {
    console.error("Error generating batch embeddings:", error);
    return texts.map(() => []);
  }
};

const formatHistory = (history: Message[]): string => {
  return history
    .filter(m => m.text)
    .slice(-8)
    .map(m => `[${m.role === 'user' ? 'USER QUERY' : 'MODEL RESPONSE'}]: ${m.text}`)
    .join("\n\n");
};

/**
 * Generates an audio overview of the paper.
 */
export const generateAudioOverview = async (file: UploadedFile): Promise<{ audioData: string, script: string }> => {
  try {
    const context = file.extractedText ? file.extractedText.slice(0, 15000) : "";

    // 1. Generate the Script using Gemini 3 Pro for better narrative flow
    const scriptPrompt = `
      IDENTITY: Award-Winning Science Communicator & Podcast Host.
      CURRENT DATE: ${getCurrentDate()}
      
      TASK: Transform the following academic text into a gripping, narrative-driven audio script.
      
      SOURCE MATERIAL:
      ${context}
      
      SCRIPT GUIDELINES:
      - **The Hook**: Start with a counter-intuitive fact or a provocative question derived from the paper.
      - **The Narrative Arc**: Treat the research as a detective story. What was the mystery? How did they solve it? What is the twist?
      - **Language**: Use analogies and vivid imagery. Avoid dry academic passive voice.
      - **Constraint**: Maximum 200 words. Optimized for spoken rhythm.
      
      OUTPUT:
      Return ONLY the script text.
    `;

    const scriptResponse = await ai.models.generateContent({
      model: INTELLIGENCE_MODEL, // Upgraded to 3 Pro
      contents: scriptPrompt,
    });
    
    const script = scriptResponse.text || "Here is a summary of the paper.";

    // 2. Generate Audio (TTS) - Must use specialized TTS model
    const audioResponse = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: { parts: [{ text: script }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audioData = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      throw new Error("Failed to generate audio data.");
    }

    return { audioData, script };

  } catch (error) {
    console.error("Audio generation error:", error);
    throw error;
  }
};

/**
 * Streams the RAG response with Thinking Mode enabled.
 */
export const generateRagResponseStream = async function* (
  query: string,
  contextChunks: SearchResult[],
  history: Message[] = []
): AsyncGenerator<StreamResponse, void, unknown> {
  
  const contextText = contextChunks.map((chunk, index) => `
    [Archive Document ${index + 1}]: ${chunk.fileName}
    [Excerpt]: ${chunk.textSnippet}
    ---
  `).join("\n");

  const historyContext = formatHistory(history);

  const prompt = `
    IDENTITY: You are Gemini 3 Pro, a Hyper-Intelligent Research Partner designed to synthesize information across disciplinary boundaries.
    CURRENT DATE: ${getCurrentDate()}
    
    CONTEXT: The user is engaged in high-level scientific inquiry. They require answers that are rigorous, nuanced, and conceptually integrated.
    
    INPUTS:
    1. Conversation History: ${historyContext}
    2. Retrieved Archives: ${contextText}
    3. Current Inquiry: ${query}
    
    PROTOCOL:
    1.  **Reasoning Process (<reasoning>)**: 
        *   Analyze the query's intent (factual, theoretical, or speculative).
        *   Evaluate the retrieved archives: Are they consistent? Do they contradict? 
        *   Identify gaps where external knowledge (from your general training) bridges the archival data.
    2.  **Synthesis**: 
        *   Do not just summarize. *Synthesize*. Connect Document A's methodology to Document B's results. 
        *   Highlight novel implications that the user might have missed.
    3.  **Visual Intelligence**: If the text snippets contain [Visual Entity] tags, explicitly interpret them in the context of the user's question.
    
    TONE: Academic, confident, yet open to complexity.
  `;

  try {
    const result = await ai.models.generateContentStream({
      model: INTELLIGENCE_MODEL, // Gemini 3 Pro
      contents: prompt,
      config: {
        thinkingConfig: {
          thinkingBudget: 8192
        }
      }
    });

    for await (const chunk of result) {
      if (chunk.text) {
        yield { text: chunk.text };
      }
    }
  } catch (error) {
    console.error("Error generating stream:", error);
    yield { text: "An error occurred during the archival research process." };
  }
};

/**
 * Streams response using Google Search grounding.
 */
export const generateSearchResponseStream = async function* (
  query: string,
  contextChunks: SearchResult[],
  history: Message[] = []
): AsyncGenerator<StreamResponse, void, unknown> {
  
  const contextText = contextChunks.map(c => `[Excerpt from ${c.fileName}]: ${c.textSnippet}`).join("\n\n");
  const historyContext = formatHistory(history);

  const prompt = `
    IDENTITY: Global Research Intelligence Unit (Gemini 3 Pro).
    CURRENT DATE: ${getCurrentDate()}
    
    TASK: Conduct a high-velocity investigation to answer the user's query, fusing real-time web data with local archival knowledge.

    CONTEXT:
    *   **Local Archives**: ${contextText}
    *   **History**: ${historyContext}
    *   **Query**: ${query}

    STRATEGY:
    1.  **Search Execution**: Use the \`googleSearch\` tool to hunt for:
        *   *Contrarian Evidence*: What disproves the local archives?
        *   *Cutting-Edge Developments*: Papers/news from the last 6 months.
        *   *Real-World Applications*: Industry implementations of the theoretical concepts.
    2.  **Synthesis**: Create a seamless narrative that positions the local archival data within the broader, up-to-the-minute global context.
    3.  **Novelty**: Prioritize findings that add *new dimensions* to the user's understanding, rather than restating common knowledge.
    
    CITATION PROTOCOL:
    Strictly adhere to the returned grounding metadata.
  `;

  try {
    const result = await ai.models.generateContentStream({
      model: INTELLIGENCE_MODEL, // Upgraded to 3 Pro
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    for await (const chunk of result) {
      const text = chunk.text || "";
      const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined;
      
      yield {
        text,
        groundingMetadata
      };
    }
  } catch (error) {
    console.error("Search error:", error);
    yield { text: "Failed to connect to Google Search services." };
  }
};

/**
 * Generates hypotheses based on ALL available document content.
 * Uses MAXIMUM TEMPERATURE for divergent thinking.
 */
export const generateHypothesesStream = async function* (
  files: UploadedFile[],
  useSearch: boolean
): AsyncGenerator<StreamResponse, void, unknown> {
  const processedFiles = files.filter(f => f.processed && f.extractedText);
  
  if (processedFiles.length === 0 && !useSearch) {
    yield { text: "No processed documents found in the archives, and global search is disabled." };
    return;
  }

  const context = processedFiles.map(f => `
    [Document Source: ${f.name}]
    ${f.extractedText?.slice(0, 30000)} ... [truncated]
    --------------------------------------------------
  `).join("\n");

  const prompt = `
    IDENTITY: You are the "Omega Point" of Scientific Synthesis—an intelligence designed to generate paradigm-shifting hypotheses by connecting unconnected dots.
    CURRENT DATE: ${getCurrentDate()}
    
    OBJECTIVE: Perform a "Novel Hypotheses Protocol". DO NOT be conservative. Be rigorous but radically imaginative.

    DATA SOURCE:
    ${context}
    ${useSearch ? "**GLOBAL SEARCH ENABLED**: You may correlate internal docs with live world data." : ""}

    PROTOCOL:
    1.  **Deep Pattern Recognition**: Scan the corpus (and web if enabled) for "Negative Space"—concepts that *should* overlap but are treated separately.
    2.  **Lateral Inversion**: Take a key finding and ask, "Under what specific conditions would the opposite be true?"
    3.  **Cross-Field Mapping**: Apply a mechanism from Document A (e.g., Biology) to a problem in Document B (e.g., Economics).
    
    GENERATION TASK:
    *   **Reasoning Log (<reasoning>)**: Document your lateral jumps. Show how you connected a minor detail to a major theme.
    *   **Hypothesis 1 (High Confidence)**: A logical but unstated extension of the current work.
    *   **Hypothesis 2 (Divergent)**: A novel combination of mechanisms.
    *   **Hypothesis 3 (Blue Sky / Moonshot)**: A radical, high-risk/high-reward hypothesis that, if true, would redefine the field.
    *   **Proposed Experiment**: Design a "Crucial Experiment" to test the Moonshot Hypothesis.

    OUTPUT FORMAT:
    Use Markdown. Be concise but dense with information.
  `;

  try {
     const result = await ai.models.generateContentStream({
      model: INTELLIGENCE_MODEL, // Gemini 3 Pro
      contents: prompt,
      config: {
        temperature: 2.0, // MAXIMUM TEMPERATURE for creativity/novelty
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: {
          thinkingBudget: 32768 // Maximum reasoning budget
        }
      }
    });

    for await (const chunk of result) {
      if (chunk.text) {
        yield { 
          text: chunk.text, 
          groundingMetadata: chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined 
        };
      }
    }
  } catch (error) {
    console.error("Deep Research Error:", error);
    yield { text: "The novel hypotheses protocol encountered an error." };
  }
};

/**
 * FEATURE: Adversarial Peer Review
 * Objective: Find flaws, gaps, and biases in the research.
 */
export const generateCritiqueStream = async function* (
  history: Message[],
  files: UploadedFile[],
  useSearch: boolean
): AsyncGenerator<StreamResponse, void, unknown> {
  const processedFiles = files.filter(f => f.processed).slice(0, 5); // Focus on recent context
  const context = processedFiles.map(f => `[${f.name}]: ${f.metadata?.summary}`).join("\n");
  const historyText = formatHistory(history);

  const prompt = `
    IDENTITY: "Reviewer #2" (The Adversarial Critic).
    CURRENT DATE: ${getCurrentDate()}
    
    TASK: Ruthlessly critique the research direction, hypotheses, or conclusions found in the conversation history and attached documents.

    CONTEXT:
    Conversation: ${historyText}
    Document Summaries: ${context}
    ${useSearch ? "**GLOBAL SEARCH ENABLED**: Use live data to find contradictory evidence or debunk claims." : ""}

    DIRECTIVES:
    1.  **Attack the Logic**: Identify "Non Sequiturs" where conclusions do not follow from premises.
    2.  **Bias Detection**: Highlight sampling biases, p-hacking risks, or over-fitting in the described methodologies.
    3.  **Alternative Explanations**: Propose Occam's Razor alternatives that the user has ignored.
    4.  **Constructive Destruction**: Don't just break it; tell them exactly what control experiment is missing to fix it.

    OUTPUT FORMAT:
    Start with <reasoning> to plan the attack vectors.
    Then provide a "Peer Review Report" in Markdown.
  `;

  try {
    const result = await ai.models.generateContentStream({
      model: INTELLIGENCE_MODEL,
      contents: prompt,
      config: {
        temperature: 0.7, // Lower temperature for logic and critical thinking
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: { thinkingBudget: 16384 }
      }
    });

    for await (const chunk of result) {
      if (chunk.text) {
         yield { 
           text: chunk.text,
           groundingMetadata: chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined
         };
      }
    }
  } catch (error) {
    yield { text: "The adversarial review board is currently unavailable." };
  }
};

/**
 * FEATURE: Lateral Methodology Transfer
 * Objective: Apply a method from Doc A to a problem in Doc B.
 */
export const generateMethodologyTransferStream = async function* (
  files: UploadedFile[],
  useSearch: boolean
): AsyncGenerator<StreamResponse, void, unknown> {
  const processedFiles = files.filter(f => f.processed && f.extractedText);
  if (processedFiles.length === 0 && !useSearch) { yield { text: "Archives empty and search disabled." }; return; }

  const context = processedFiles.map(f => `[${f.name}]: ${f.extractedText?.slice(0, 10000)}`).join("\n---\n");

  const prompt = `
    IDENTITY: Interdisciplinary Systems Architect.
    CURRENT DATE: ${getCurrentDate()}
    
    TASK: Perform "Methodology Transfer". Identify a robust METHOD from one document (or search) and theoretically apply it to a PROBLEM in a different document (or the general field).

    ARCHIVES:
    ${context}
    ${useSearch ? "**GLOBAL SEARCH ENABLED**: You may search for external methodologies to apply to the local problems." : ""}

    PROTOCOL:
    1.  **Deconstruct**: Break down the unique methods found (e.g., algorithms, chemical synthesis, survey techniques).
    2.  **Transplant**: Force-fit a method from Document A onto the dataset or problem statement of Document B.
    3.  **Simulate**: Predict what would happen. Would it reveal new data? Would it fail?

    OUTPUT:
    Start with <reasoning>.
    Then: "**Proposed Methodology Transfer: [Name]**"
    1.  *Source Method*: [Method] from [Doc A/Web]
    2.  *Target Problem*: [Problem] in [Doc B/Context]
    3.  *The Innovation*: How this combination creates novelty.
  `;

  try {
    const result = await ai.models.generateContentStream({
      model: INTELLIGENCE_MODEL,
      contents: prompt,
      config: {
        temperature: 1.5, // High creativity
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: { thinkingBudget: 24576 }
      }
    });

    for await (const chunk of result) {
      if (chunk.text) {
        yield { 
          text: chunk.text,
          groundingMetadata: chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined
        };
      }
    }
  } catch (error) {
    yield { text: "Methodology transfer failed." };
  }
};

/**
 * FEATURE: Protocol Genesis
 * Objective: Turn abstract ideas into concrete lab steps.
 */
export const generateExperimentStream = async function* (
  history: Message[],
  useSearch: boolean
): AsyncGenerator<StreamResponse, void, unknown> {
  const historyText = formatHistory(history);

  const prompt = `
    IDENTITY: Laboratory Operations Manager & Experimental Designer.
    CURRENT DATE: ${getCurrentDate()}
    
    TASK: Convert the most recent hypothesis or idea in the conversation history into a concrete, executable EXPERIMENTAL PROTOCOL.

    HISTORY:
    ${historyText}
    ${useSearch ? "**GLOBAL SEARCH ENABLED**: Verify reagent availability, standard dosages, and equipment specs via web search." : ""}

    DIRECTIVES:
    1.  **Concretize**: No abstract terms. Specify quantities, durations, and equipment.
    2.  **Controls**: Define Positive and Negative controls.
    3.  **Variables**: Explicitly state Independent and Dependent variables.
    4.  **Step-by-Step**: Numbered list of actions.

    OUTPUT:
    Start with <reasoning>.
    Title: **Experimental Protocol: [Name]**
  `;

  try {
    const result = await ai.models.generateContentStream({
      model: INTELLIGENCE_MODEL,
      contents: prompt,
      config: {
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: { thinkingBudget: 16384 }
      }
    });

    for await (const chunk of result) {
      if (chunk.text) {
        yield { 
          text: chunk.text,
          groundingMetadata: chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined
        };
      }
    }
  } catch (error) {
    yield { text: "Protocol generation failed." };
  }
};

/**
 * FEATURE: Scientific Round Table
 * Objective: Simulate a multi-agent debate to evaluate an idea.
 * UPDATED: Optimized for Group Chat UI.
 */
export const generateRoundTableStream = async function* (
  history: Message[],
  files: UploadedFile[],
  useSearch: boolean
): AsyncGenerator<StreamResponse, void, unknown> {
  const processedFiles = files.filter(f => f.processed).slice(0, 3);
  const context = processedFiles.map(f => `[${f.name}]: ${f.metadata?.summary}`).join("\n");
  const historyText = formatHistory(history);

  const prompt = `
    IDENTITY: You are the **Orchestrator** of a high-stakes Scientific Advisory Board.
    CURRENT DATE: ${getCurrentDate()}
    
    TASK: Simulate a vivid, multi-turn "Group Chat" debate regarding the user's latest query. The output must be formatted strictly as a script so the user interface can render it as separate chat bubbles.
    
    INPUTS:
    Conversation: ${historyText}
    Document Context: ${context}
    ${useSearch ? "**GLOBAL SEARCH ENABLED**: The agents have access to live web data via the \`googleSearch\` tool. Use it to verify facts, find recent papers, or check current events." : ""}

    THE BOARD MEMBERS (AGENTS):
    1.  **Dr. V**: (Data Scientist) - Skeptical, math-obsessed. Checks stats, p-values, sample sizes. "Show me the data."
    2.  **Prof. E**: (Ethicist) - Focused on safety, society, regulation, and bias. "Is this responsible?"
    3.  **Director A**: (Strategist) - Visionary, funding-focused, big picture. "What is the ROI? Is it novel?"
    4.  **Orchestrator**: (You) - The moderator who summarizes and gives the final verdict.

    PROTOCOL:
    1.  Simulate a dynamic conversation. Members should respond to each other, not just the user.
    2.  Use the exact format below for every turn. Do NOT use markdown headers or bolding for the names.
    ${useSearch ? "3. **CITATION PROTOCOL**: When an agent references specific external facts found via search, they MUST use bracketed numbers like [1], [2], etc. corresponding to the order of facts found. Example: 'The data shows a 50% increase [1].'" : ""}

    REQUIRED OUTPUT FORMAT:
    
    [Dr. V]: <message content>
    
    [Prof. E]: <message content>
    
    [Director A]: <message content>
    
    [Dr. V]: <rebuttal>
    
    [Orchestrator]: <Final Verdict / Synthesis>
    
    RULES:
    *   Do NOT include <reasoning> tags. The users want to see the agents arguing in real-time.
    *   Ensure distinct personalities in the tone.
    *   The "Orchestrator" must speak last to provide the conclusion.
  `;

  try {
    const result = await ai.models.generateContentStream({
      model: INTELLIGENCE_MODEL,
      contents: prompt,
      config: {
        temperature: 2.0, // Max temperature for distinct personas
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: { thinkingBudget: 24576 }
      }
    });

    for await (const chunk of result) {
      if (chunk.text) {
        yield { 
          text: chunk.text,
          groundingMetadata: chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined
        };
      }
    }
  } catch (error) {
    yield { text: "[Orchestrator]: The Scientific Advisory Board is currently in a closed session. Please try again." };
  }
};

/**
 * FEATURE 1: Systematic Review Matrix Builder
 */
export const generateMatrixStream = async function* (
  variables: string,
  files: UploadedFile[],
  useSearch: boolean
): AsyncGenerator<StreamResponse, void, unknown> {
  const processedFiles = files.filter(f => f.processed && f.extractedText);
  
  if (processedFiles.length === 0 && !useSearch) {
    yield { text: "No documents available to extract data from. Please upload files or enable search." };
    return;
  }

  // Limit context to avoid token limits, though Gemini context is huge.
  // We'll map file names to content.
  const context = processedFiles.map((f, i) => `
    [Document ID: ${i+1}]
    Title: ${f.name}
    Content: ${f.extractedText?.slice(0, 20000)} ...
    ---
  `).join("\n");

  const prompt = `
    IDENTITY: Systematic Review Data Extractor.
    CURRENT DATE: ${getCurrentDate()}
    
    TASK: Build a rigorous "Evidence Table" (Matrix) extracting specific variables from the provided documents.
    
    TARGET VARIABLES: ${variables}
    
    DOCUMENTS:
    ${context}
    ${useSearch ? "**GLOBAL SEARCH ENABLED**: Fill missing data using external search if not found in docs." : ""}

    PROTOCOL:
    1.  Scan each document for the requested variables.
    2.  If exact data is missing, infer it from context if high confidence, otherwise "N/A".
    3.  Standardize units (e.g., convert all time to seconds if mixed).
    
    OUTPUT FORMAT:
    Start with <reasoning> to explain extraction challenges or unit conversions.
    Then output a CLEAN Markdown Table. Do not include any text before or after the table outside the reasoning block.
    
    | Document | [Var 1] | [Var 2] | ...
    | :--- | :--- | :--- | ...
  `;

   try {
    const result = await ai.models.generateContentStream({
      model: INTELLIGENCE_MODEL,
      contents: prompt,
      config: {
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
        thinkingConfig: { thinkingBudget: 16384 }
      }
    });

    for await (const chunk of result) {
      if (chunk.text) {
        yield { 
          text: chunk.text,
          groundingMetadata: chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined
        };
      }
    }
  } catch (error) {
    yield { text: "Matrix generation failed." };
  }
};