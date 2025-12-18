export enum AppStage {
  COLLECT_NAME = 'COLLECT_NAME',
  COLLECT_COMPANY = 'COLLECT_COMPANY',
  COLLECT_JOB = 'COLLECT_JOB',
  COLLECT_PHONE = 'COLLECT_PHONE',
  COLLECT_EMAIL = 'COLLECT_EMAIL',
  COLLECT_TOPIC = 'COLLECT_TOPIC',
  FILE_UPLOAD = 'FILE_UPLOAD',
  PROCESSING_FILE = 'PROCESSING_FILE',
  Q_AND_A = 'Q_AND_A',
  QUIZ_LOADING = 'QUIZ_LOADING',
  QUIZ_ACTIVE = 'QUIZ_ACTIVE',
  QUIZ_RESULTS = 'QUIZ_RESULTS',
  ASK_SEND_REPORT = 'ASK_SEND_REPORT',
  COLLECT_FACILITATOR_EMAIL = 'COLLECT_FACILITATOR_EMAIL',
  COMPLETED = 'COMPLETED'
}

export type Language = 'en' | 'es';

export interface UserData {
  name: string;
  company: string;
  jobTitle: string;
  phone: string;
  email: string;
  topic: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: 'text' | 'file-request' | 'quiz-prompt';
  timestamp: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string; // The correct string value
  userAnswer?: string;
}

export interface FileData {
  name: string;
  mimeType: string;
  data: string; // base64
}