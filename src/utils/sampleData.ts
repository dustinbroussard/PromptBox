import type { Prompt, AiSettings } from '../types.ts';

export const DEFAULT_ENHANCEMENT_PROMPT =
  'You are an expert prompt engineer. Improve the prompt for clarity and effectiveness while preserving intent. Return only the improved prompt text.';

export const DEFAULT_AI_MODEL = 'openrouter/free';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  apiKey: '',
  model: DEFAULT_AI_MODEL,
  enhancementPrompt: DEFAULT_ENHANCEMENT_PROMPT
};

export const SAMPLE_PROMPTS: Prompt[] = [
  {
    id: '1',
    title: 'Creative Writing Assistant',
    preview: "Help me write engaging stories with vivid descriptions and compelling characters. Focus on show don't tell techniques...",
    content: "You are a creative writing assistant. Help me write engaging stories with vivid descriptions and compelling characters. Focus on 'show don't tell' techniques, create immersive settings, and develop authentic dialogue. Always ask clarifying questions about genre, tone, and target audience before starting.",
    tags: ['writing', 'creative'],
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z',
    lastUsed: '2024-01-01T10:00:00.000Z',
    useCount: 23
  },
  {
    id: '2',
    title: 'Code Review Expert',
    preview: 'Analyze code for best practices, security vulnerabilities, and performance optimizations. Provide detailed feedback...',
    content: 'You are an expert code reviewer with deep knowledge of multiple programming languages. Analyze code for best practices, security vulnerabilities, performance optimizations, and maintainability. Provide specific, actionable feedback with examples of improvements.',
    tags: ['coding', 'analysis'],
    createdAt: '2024-01-02T11:30:00.000Z',
    updatedAt: '2024-01-02T11:30:00.000Z',
    lastUsed: '2024-01-02T11:30:00.000Z',
    useCount: 45
  },
  {
    id: '3',
    title: 'Business Strategy Consultant',
    preview: 'Provide strategic business advice with market analysis, competitive positioning, and growth recommendations...',
    content: "Act as a senior business strategy consultant. Provide strategic business advice with market analysis, competitive positioning, and growth recommendations. Use frameworks like SWOT, Porter's Five Forces, and Blue Ocean Strategy when relevant.",
    tags: ['business', 'analysis'],
    createdAt: '2024-01-03T14:00:00.000Z',
    updatedAt: '2024-01-03T14:00:00.000Z',
    lastUsed: '2024-01-03T14:00:00.000Z',
    useCount: 12
  },
  {
    id: '4',
    title: 'Python Debugging Helper',
    preview: 'Debug Python code by identifying errors, suggesting fixes, and explaining best practices for clean code...',
    content: 'You are a Python debugging expert. Help identify errors in Python code, suggest fixes, and explain best practices for writing clean, efficient Python code. Include explanations of common pitfalls and how to avoid them.',
    tags: ['coding', 'python'],
    createdAt: '2024-01-04T16:45:00.000Z',
    updatedAt: '2024-01-04T16:45:00.000Z',
    lastUsed: '2024-01-04T16:45:00.000Z',
    useCount: 31
  }
];
