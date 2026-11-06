import type {
  AudioVoices,
  BrandingMediaItem,
  BrandingSettings,
  KnowledgeDocument,
  MemoryFact,
  PromptSettings,
  RVCDeleteResponse,
  RVCModel,
  RVCModelsResponse,
  RVCUploadResponse,
  SearchResponse,
  SessionDetail,
  SessionSummary,
  StoredMemoryFact,
  StreamEvent,
  VoicePrompt,
  VoicePromptListResponse,
  VoicePromptMutationResponse,
  VoicePromptUploadResponse,
} from '../types'
import { createSseParser } from './sse'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'request_failed', status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  try {
    const payload = await response.json()
    const detail = payload?.detail
    if (typeof detail === 'string') {
      return new ApiError(detail, 'http_error', response.status)
    }
    if (detail && typeof detail === 'object') {
      return new ApiError(
        String(detail.message || '请求失败'),
        String(detail.code || 'http_error'),
        response.status,
      )
    }
    return new ApiError(String(payload?.message || '请求失败'), 'http_error', response.status)
  } catch {
    return new ApiError(`请求失败（HTTP ${response.status}）`, 'http_error', response.status)
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    const headers = new Headers(init?.headers)
    response = await fetch(apiUrl(path), { ...init, headers })
  } catch {
    throw new ApiError('无法连接后端服务，请确认 FastAPI 已启动', 'network_error')
  }
  if (!response.ok) throw await errorFromResponse(response)
  return (await response.json()) as T
}

export async function checkHealth(): Promise<boolean> {
  try {
    const data = await requestJson<{ status: string }>('/api/health')
    return data.status === 'ok'
  } catch {
    return false
  }
}

export async function listSessions(): Promise<SessionSummary[]> {
  return requestJson<SessionSummary[]>('/api/sessions')
}

export async function getSession(id: string): Promise<SessionDetail> {
  return requestJson<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`)
}

export async function deleteSession(id: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function listDocuments(): Promise<KnowledgeDocument[]> {
  return requestJson<KnowledgeDocument[]>('/api/documents')
}

export async function uploadDocument(file: File): Promise<{
  document: KnowledgeDocument
  indexed_chunks: number
}> {
  const body = new FormData()
  body.append('file', file)
  return requestJson('/api/documents/upload', { method: 'POST', body })
}

export async function searchKnowledge(query: string): Promise<SearchResponse> {
  return requestJson<SearchResponse>(`/api/rag/search?q=${encodeURIComponent(query)}`)
}

export async function deleteDocument(id: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function listMemories(): Promise<StoredMemoryFact[]> {
  return requestJson<StoredMemoryFact[]>('/api/memories')
}

export async function deleteMemory(id: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(
    `/api/memories/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

export async function getPromptSettings(): Promise<PromptSettings> {
  return requestJson<PromptSettings>('/api/settings/prompt')
}

export async function updatePrompt(prompt: string): Promise<PromptSettings> {
  return requestJson<PromptSettings>('/api/settings/prompt', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
}

export async function resetPrompt(): Promise<PromptSettings> {
  return requestJson<PromptSettings>('/api/settings/prompt', {
    method: 'DELETE',
  })
}

export async function getBranding(): Promise<BrandingSettings> {
  const branding = await requestJson<BrandingSettings>('/api/settings/branding')
  return normalizeBranding(branding)
}

function normalizeBranding(branding: BrandingSettings): BrandingSettings {
  return {
    ...branding,
    logo_url: branding.logo_url ? apiUrl(branding.logo_url) : null,
    background_url: branding.background_url
      ? apiUrl(branding.background_url)
      : null,
  }
}

export async function updateBrandingName(name: string): Promise<BrandingSettings> {
  const branding = await requestJson<BrandingSettings>('/api/settings/branding', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return normalizeBranding(branding)
}

export async function uploadBrandingLogo(file: File): Promise<BrandingSettings> {
  const body = new FormData()
  body.append('file', file)
  const branding = await requestJson<BrandingSettings>('/api/settings/branding/logo', {
    method: 'POST',
    body,
  })
  return normalizeBranding(branding)
}

export async function setBrandingBackground(
  enabled: boolean,
  backgroundType?: 'image' | 'video',
): Promise<BrandingSettings> {
  const branding = await requestJson<BrandingSettings>(
    '/api/settings/branding/background',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
        background_type: backgroundType ?? null,
      }),
    },
  )
  return normalizeBranding(branding)
}

export async function uploadBrandingVideo(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<BrandingSettings> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl('/api/settings/branding/background/video'))
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onerror = () => reject(new ApiError('视频上传失败，请检查后端连接', 'network_error'))
    xhr.onload = () => {
      let payload: unknown
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        reject(new ApiError('视频上传返回了无效响应', 'invalid_response', xhr.status))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const detail = (payload as { detail?: unknown })?.detail
        if (detail && typeof detail === 'object') {
          const value = detail as { message?: string; code?: string }
          reject(new ApiError(value.message || '视频上传失败', value.code, xhr.status))
        } else {
          reject(new ApiError(String(detail || '视频上传失败'), 'http_error', xhr.status))
        }
        return
      }
      resolve(normalizeBranding(payload as BrandingSettings))
    }
    const body = new FormData()
    body.append('file', file)
    xhr.send(body)
  })
}

export async function listBrandingMedia(): Promise<BrandingMediaItem[]> {
  const items = await requestJson<BrandingMediaItem[]>(
    '/api/settings/branding/media',
  )
  return items.map((item) => ({ ...item, url: apiUrl(item.url) }))
}

export async function useBrandingMedia(
  kind: 'image' | 'video',
  filename: string,
  target: 'logo' | 'background' = 'background',
): Promise<BrandingSettings> {
  const branding = await requestJson<BrandingSettings>(
    '/api/settings/branding/media/use',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, filename, target }),
    },
  )
  return normalizeBranding(branding)
}

export async function deleteBrandingMedia(
  kind: 'image' | 'video',
  filename: string,
): Promise<BrandingSettings> {
  const branding = await requestJson<BrandingSettings>(
    `/api/settings/branding/media/${kind}/${encodeURIComponent(filename)}`,
    { method: 'DELETE' },
  )
  return normalizeBranding(branding)
}

export async function resetBrandingLogo(): Promise<BrandingSettings> {
  const branding = await requestJson<BrandingSettings>('/api/settings/branding/logo', {
    method: 'DELETE',
  })
  return normalizeBranding(branding)
}

export async function listVoices(): Promise<AudioVoices> {
  return requestJson<AudioVoices>('/api/audio/voices')
}

function normalizeVoicePrompt(prompt: VoicePrompt): VoicePrompt {
  return {
    ...prompt,
    audio_url: prompt.audio_url ? apiUrl(prompt.audio_url) : null,
  }
}

export async function listVoicePrompts(): Promise<VoicePrompt[]> {
  const data = await requestJson<VoicePromptListResponse>('/api/audio/prompts')
  return data.prompts.map(normalizeVoicePrompt)
}

export async function uploadVoicePrompt(
  file: File,
  name = '',
  text = '',
  durationLimit = 15,
): Promise<VoicePromptUploadResponse> {
  const body = new FormData()
  body.append('file', file)
  if (name.trim()) body.append('name', name.trim())
  if (text.trim()) body.append('text', text.trim())
  body.append('duration_limit', String(durationLimit))
  const result = await requestJson<VoicePromptUploadResponse>(
    '/api/audio/prompts',
    { method: 'POST', body },
  )
  return { ...result, prompt: normalizeVoicePrompt(result.prompt) }
}

export async function updateVoicePrompt(
  id: string,
  values: { name?: string; text?: string },
): Promise<VoicePrompt> {
  const data = await requestJson<VoicePromptMutationResponse>(
    `/api/audio/prompts/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    },
  )
  return normalizeVoicePrompt(data.prompt)
}

export async function transcribeVoicePrompt(id: string): Promise<VoicePrompt> {
  const data = await requestJson<VoicePromptMutationResponse>(
    `/api/audio/prompts/${encodeURIComponent(id)}/transcribe`,
    { method: 'POST' },
  )
  return normalizeVoicePrompt(data.prompt)
}

export async function deleteVoicePrompt(id: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(
    `/api/audio/prompts/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

export interface TTSStreamOptions {
  engine: 'edge_tts' | 'cosyvoice'
  edgeVoice?: string
  rvcEnabled: boolean
  rvcModel?: string
  rvcIndex?: string
  promptId?: string
  rvcIndexRate?: number
  rvcProtect?: number
  rvcRmsMixRate?: number
  rvcF0UpKey?: number
  ttsSpeed?: number
}

export interface TTSAudioSegment {
  samples: Float32Array
  sampleRate: number
}

export async function* streamTTSSegments(
  text: string,
  options: TTSStreamOptions,
  signal?: AbortSignal,
): AsyncGenerator<TTSAudioSegment> {
  let response: Response
  try {
    response = await fetch(apiUrl('/api/audio/tts/stream'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        engine: options.engine,
        edge_voice: options.edgeVoice || undefined,
        rvc_enabled: options.rvcEnabled,
        rvc_model: options.rvcModel || undefined,
        rvc_index: options.rvcIndex || undefined,
        prompt_id: options.promptId || undefined,
        rvc_index_rate: options.rvcIndexRate,
        rvc_protect: options.rvcProtect,
        rvc_rms_mix_rate: options.rvcRmsMixRate,
        rvc_f0_up_key: options.rvcF0UpKey,
        tts_speed: options.ttsSpeed,
      }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('无法连接流式 TTS 服务', 'network_error')
  }
  if (!response.ok) throw await errorFromResponse(response)
  if (!response.body) throw new ApiError('TTS 响应为空', 'empty_audio')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (!line) continue
        const event = JSON.parse(line) as {
          type: string
          data?: string
          sample_rate?: number
          message?: string
          code?: string
        }
        if (event.type === 'error') {
          throw new ApiError(event.message || '语音生成失败', event.code || 'tts_stream_failed')
        }
        if (event.type === 'audio' && event.data && event.sample_rate) {
          const binary = atob(event.data)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i)
          }
          if (bytes.byteLength % 2 !== 0) {
            throw new ApiError('PCM 音频数据不完整', 'invalid_audio')
          }
          const view = new DataView(bytes.buffer)
          const samples = new Float32Array(bytes.byteLength / 2)
          for (let i = 0; i < samples.length; i += 1) {
            samples[i] = view.getInt16(i * 2, true) / 32768
          }
          yield { samples, sampleRate: event.sample_rate }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function listRVCModels(): Promise<RVCModelsResponse> {
  return requestJson<RVCModelsResponse>('/api/audio/rvc/models')
}

export async function uploadRVCModel(
  modelFile: File,
  indexFile?: File,
): Promise<RVCUploadResponse> {
  const form = new FormData()
  form.append('model', modelFile)
  if (indexFile) form.append('index', indexFile)
  return requestJson<RVCUploadResponse>('/api/audio/rvc/models', {
    method: 'POST',
    body: form,
  })
}

export async function uploadRVCIndex(
  modelName: string,
  indexFile: File,
): Promise<{ model_name: string; index_saved: string }> {
  const form = new FormData()
  form.append('index', indexFile)
  return requestJson<{ model_name: string; index_saved: string }>(
    `/api/audio/rvc/models/${encodeURIComponent(modelName)}/index`,
    { method: 'POST', body: form },
  )
}

export async function deleteRVCModel(name: string): Promise<RVCDeleteResponse> {
  return requestJson<RVCDeleteResponse>(
    `/api/audio/rvc/models/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  )
}

export async function refreshRVCVoices(): Promise<AudioVoices> {
  return requestJson<AudioVoices>('/api/audio/rvc/refresh', { method: 'POST' })
}

export async function preloadRVCModel(modelName: string): Promise<{
  preloaded: boolean
  model_name: string
}> {
  return requestJson(
    `/api/audio/rvc/preload?model_name=${encodeURIComponent(modelName)}`,
    { method: 'POST' },
  )
}

export async function setRVCRuntime(enabled: boolean): Promise<{ enabled: boolean }> {
  return requestJson<{ enabled: boolean }>('/api/audio/rvc/runtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

export type { MemoryFact }

export interface StreamChatOptions {
  message: string
  sessionId?: string
  enableWebSearch?: boolean
  showSources?: boolean
  signal?: AbortSignal
  onEvent: (event: StreamEvent) => void
}

export async function streamChat({
  message,
  sessionId,
  enableWebSearch = false,
  showSources = false,
  signal,
  onEvent,
}: StreamChatOptions): Promise<void> {
  let response: Response
  try {
    response = await fetch(apiUrl('/api/chat/stream'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message,
        session_id: sessionId || null,
        enable_web_search: enableWebSearch,
        show_sources: showSources,
      }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('无法连接流式聊天接口，请确认后端已启动', 'network_error')
  }

  if (!response.ok) throw await errorFromResponse(response)
  if (!response.body) {
    throw new ApiError('浏览器没有收到可读取的流式响应', 'empty_stream')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()

  const dispatch = (rawEvents: string[]) => {
    for (const raw of rawEvents) {
      try {
        onEvent(JSON.parse(raw) as StreamEvent)
      } catch {
        throw new ApiError('后端返回了无法解析的流式事件', 'invalid_sse')
      }
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      dispatch(parser.feed(decoder.decode(value, { stream: true })))
    }
    dispatch(parser.feed(decoder.decode()))
    dispatch(parser.flush())
  } finally {
    reader.releaseLock()
  }
}
