import { VectorRecord, SearchResult } from '../types';
import { generateEmbedding, generateBatchEmbeddings } from './geminiService';

// Simple in-memory store
let vectorDatabase: VectorRecord[] = [];

// Calculate Cosine Similarity
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
};

export const addDocumentToStore = async (
  id: string,
  fileId: string,
  fileName: string,
  text: string
): Promise<void> => {
  // 1. Chunking
  // Split by double newlines (paragraphs) to create meaningful semantic units
  // Slightly aggressive filtering to keep quality high and count low
  const rawChunks = text.split(/\n\s*\n/);
  const chunks = rawChunks
    .map(c => c.trim())
    .filter(c => c.length >= 50); // Filter tiny noise/headers

  // 2. Batch Embedding using GoogleGenAI's batchEmbedContents
  // This allows processing ~100 chunks in a single HTTP request
  const BATCH_SIZE = 80; // Safe limit below 100
  
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchTexts = chunks.slice(i, i + BATCH_SIZE);
    
    try {
        const embeddings = await generateBatchEmbeddings(batchTexts);
        
        // Map back to records
        const newRecords: VectorRecord[] = batchTexts.map((chunkText, idx) => ({
            id: Math.random().toString(36),
            fileId,
            fileName,
            text: chunkText,
            embedding: embeddings[idx] || [] // Handle potential empty returns safety
        })).filter(r => r.embedding.length > 0);

        vectorDatabase.push(...newRecords);
    } catch (e) {
        console.warn(`Failed to process embedding batch for ${fileName}`, e);
    }
  }
};

export const deleteDocumentFromStore = (fileId: string): void => {
  vectorDatabase = vectorDatabase.filter(record => record.fileId !== fileId);
};

// Increased topK to 8 to facilitate better cross-document comparison
export const searchVectorStore = async (query: string, topK: number = 8): Promise<SearchResult[]> => {
  if (vectorDatabase.length === 0) return [];

  const queryEmbedding = await generateEmbedding(query);

  const scoredRecords = vectorDatabase.map(record => ({
    ...record,
    similarity: cosineSimilarity(queryEmbedding, record.embedding)
  }));

  // Sort by similarity descending
  scoredRecords.sort((a, b) => b.similarity - a.similarity);

  // Return top K
  return scoredRecords.slice(0, topK).map(r => ({
    fileId: r.fileId,
    fileName: r.fileName,
    similarity: r.similarity,
    textSnippet: r.text
  }));
};

export const clearStore = () => {
  vectorDatabase = [];
};