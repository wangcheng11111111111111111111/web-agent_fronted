export type Role = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: Role
  content: string
  createdAt?: string
  streaming?: boolean
  error?: boolean
  sources?: Source[]
  memories?: MemoryFact[]
  recalledConversations?: RecalledConversation[]
}

export interface Source {
  document_id: string
  filename: string
  chunk_index: number
  score: number
  content: string
}

export interface SessionSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

export interface SessionDetail extends SessionSummary {
  messages: Array<{
    id: string
    role: Role
    content: string
    created_at: string
  }>
}

export interface KnowledgeDocument {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  chunk_count: number
  created_at: string
}

export interface SearchResponse {
  query: string
  results: Source[]
}

export interface MemoryFact {
  fact_id: string
  fact_type: string
  memory_key?: string
  subject: string
  content: string
  score: number
}

export interface StoredMemoryFact {
  id: string
  client_id: string
  tenant_id: string
  user_id: string
  fact_type: string
  memory_key: string
  subject: string
  content: string
  confidence: number
  source_session_id?: string | null
  created_at: string
  updated_at: string
  importance?: number
  access_count?: number
  last_accessed_at?: string | null
  expires_at?: string | null
}

export interface BrandingSettings {
  name: string
  logo_url: string | null
  background_enabled: boolean
  background_type: 'image' | 'video' | null
  background_url: string | null
  updated_at: string | null
}

export interface BrandingMediaItem {
  kind: 'image' | 'video'
  filename: string
  url: string
  size_bytes: number
  created_at: string
  usage: Array<'logo' | 'background'>
}

export interface RecalledConversation {
  message_id: string
  session_id: string
  session_title: string
  role: Role
  content: string
  created_at: string
  score: number
}

export type StreamEvent =
  | { type: 'start'; session_id: string }
  | {
      type: 'status'
      stage: string
      message?: string
      route?: string
      source_count?: number
      memory_count?: number
      recalled_conversation_count?: number
    }
  | { type: 'delta'; content: string }
  | { type: 'error'; code: string; message: string }
  | {
      type: 'done'
      status: 'ok' | 'error'
      session_id: string
      assistant_message_id?: string | null
      sources?: Source[]
      web_sources?: WebSource[]
      memories?: MemoryFact[]
      recalled_conversations?: RecalledConversation[]
      memory_write_queued?: boolean
    }

export interface WebSource {
  title: string
  url: string
  snippet: string
}

export interface PromptSettings {
  prompt: string
  default: string
  is_custom: boolean
  length: number
}

export interface VoiceInfo {
  id: string
  name: string
  engine?: 'edge_tts' | 'rvc'
}

export interface AudioVoices {
  configured: boolean
  default_voice: string
  voices: VoiceInfo[]
  engine?: string
  rvc_enabled?: boolean
  message?: string
}

export type VoicePromptTextSource =
  | 'builtin'
  | 'manual'
  | 'recognized'
  | 'missing'
  | 'disabled'

export interface VoicePrompt {
  id: string
  name: string
  text: string
  text_source: VoicePromptTextSource
  duration: number | null
  duration_limit?: number | null
  created_at: string | null
  builtin: boolean
  audio_url: string | null
}

export interface VoicePromptListResponse {
  prompts: VoicePrompt[]
}

export interface VoicePromptMutationResponse {
  prompt: VoicePrompt
}

export interface VoicePromptUploadResponse extends VoicePromptMutationResponse {
  recognition_warning: string | null
}

export interface RVCIndexInfo {
  filename: string
  size_bytes: number
}

export interface RVCModel {
  name: string
  pth_filename: string
  pth_size_bytes: number
  indexes: RVCIndexInfo[]
  selected_index: string | null
}

export interface RVCModelsResponse {
  models: RVCModel[]
}

export interface RVCUploadResponse {
  model_name: string
  index_saved: string | null
}

export interface RVCDeleteResponse {
  deleted: boolean
  model_name: string
  deleted_indexes: string[]
}
