<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type {
  AudioVoices,
  BrandingMediaItem,
  BrandingSettings,
  PromptSettings,
  RVCModelsResponse,
  VoicePrompt,
  VoicePromptTextSource,
} from '../types'
import {
  deleteVoicePrompt,
  deleteBrandingMedia,
  deleteRVCModel,
  getBranding,
  getPromptSettings,
  listBrandingMedia,
  listRVCModels,
  listVoicePrompts,
  listVoices,
  refreshRVCVoices,
  resetBrandingLogo,
  resetPrompt,
  setRVCRuntime,
  setBrandingBackground,
  transcribeVoicePrompt,
  updateBrandingName,
  updatePrompt,
  updateVoicePrompt,
  uploadBrandingLogo,
  uploadBrandingVideo,
  uploadRVCIndex,
  uploadRVCModel,
  uploadVoicePrompt,
  useBrandingMedia,
} from '../services/api'

const props = defineProps<{
  open: boolean
  videoEnabled?: boolean
  videoMuted?: boolean
  videoVolume?: number
}>()
const emit = defineEmits<{
  close: []
  error: [message: string]
  toast: [message: string]
  brandingUpdated: [branding: BrandingSettings]
  videoToggleMute: []
  videoVolumeChange: [volume: number]
}>()

const data = ref<PromptSettings | null>(null)
const draft = ref('')
const loading = ref(false)
const saving = ref(false)
const savingState = ref<'idle' | 'saved' | 'error'>('idle')
const branding = ref<BrandingSettings | null>(null)
const brandNameDraft = ref('')
const savingBrand = ref(false)
const uploadingLogo = ref(false)
const logoInput = ref<HTMLInputElement | null>(null)
const videoInput = ref<HTMLInputElement | null>(null)
const uploadingVideo = ref(false)
const videoUploadProgress = ref(0)
const mediaItems = ref<BrandingMediaItem[]>([])
const loadingMedia = ref(false)
const mediaBusy = ref('')

const voices = ref<AudioVoices | null>(null)
const loadingVoices = ref(false)
const selectedEdgeVoice = ref<string>(
  localStorage.getItem('tts-edge-voice')
    || (
      (localStorage.getItem('tts-voice') || '').startsWith('zh-')
        ? localStorage.getItem('tts-voice') || ''
        : ''
    ),
)
const baseEngine = ref<'edge_tts' | 'cosyvoice'>(
  localStorage.getItem('tts-base-engine-v2') === 'cosyvoice' ? 'cosyvoice' : 'edge_tts',
)
const rvcEnabled = ref(localStorage.getItem('tts-rvc-enabled') !== '0')
const selectedRvcModelName = ref(localStorage.getItem('tts-rvc-model') || '')
const selectedRvcIndexName = ref(localStorage.getItem('tts-rvc-index') || '')
const changingRvcRuntime = ref(false)
const ttsVolume = ref<number>(Number(localStorage.getItem('tts-volume') ?? 1))
const ttsSpeed = ref<number>(
  clampStoredNumber('tts-speed', 1, 0.7, 1.3),
)
const rvcIndexRate = ref<number>(
  clampStoredNumber('tts-rvc-index-rate', 0.6, 0, 1),
)
const rvcProtect = ref<number>(
  clampStoredNumber('tts-rvc-protect', 0.4, 0, 0.5),
)
const rvcRmsMixRate = ref<number>(
  clampStoredNumber('tts-rvc-rms-mix-rate', 0.25, 0, 1),
)
const rvcF0UpKey = ref<number>(
  Math.round(clampStoredNumber('tts-rvc-f0-up-key', 0, -12, 12)),
)

const voicePrompts = ref<VoicePrompt[]>([])
const loadingPrompts = ref(false)
const selectedPromptId = ref(
  localStorage.getItem('tts-voice-prompt') || 'default',
)
const promptFileInput = ref<HTMLInputElement | null>(null)
const uploadingPrompt = ref(false)
const uploadPromptName = ref('')
const uploadPromptText = ref('')
const uploadDurationLimit = ref(15)
const promptBusyId = ref('')
const editPromptName = ref('')
const editPromptText = ref('')
const promptAudio = ref<HTMLAudioElement | null>(null)
const promptPlaying = ref(false)
const promptCurrentTime = ref(0)
const promptPlayerDuration = ref(0)
const promptEditorOpen = ref(false)
const PROMPT_MAX_DURATION_SECONDS = 30

const rvcModels = ref<RVCModelsResponse | null>(null)
const loadingRVCModels = ref(false)
const uploadingRVC = ref(false)
const rvcModelInput = ref<HTMLInputElement | null>(null)
const rvcIndexInput = ref<HTMLInputElement | null>(null)
const refreshingRVC = ref(false)

function clampStoredNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = localStorage.getItem(key)
  const value = raw === null ? fallback : Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

async function loadVoices(): Promise<void> {
  loadingVoices.value = true
  try {
    voices.value = await listVoices()
    if (
      localStorage.getItem('tts-base-engine-v2') === null
      && voices.value.engine === 'cosyvoice'
    ) {
      baseEngine.value = 'cosyvoice'
      localStorage.setItem('tts-base-engine-v2', 'cosyvoice')
      window.dispatchEvent(new CustomEvent('tts-settings-change'))
    }
    if (voices.value.voices.length && voices.value.default_voice) {
      const match = voices.value.voices.find((v) =>
        voices.value!.default_voice === v.id || voices.value!.default_voice.endsWith(`:${v.id}`),
      )
      if (match && match.engine === 'edge_tts' && !selectedEdgeVoice.value) {
        selectedEdgeVoice.value = match.id
      }
    }
  } catch {
    voices.value = { configured: false, default_voice: '', voices: [] }
  } finally {
    loadingVoices.value = false
  }
}

function saveVoiceSettings(notify = true): void {
  localStorage.setItem('tts-edge-voice', selectedEdgeVoice.value)
  localStorage.setItem('tts-rvc-enabled', rvcEnabled.value ? '1' : '0')
  localStorage.setItem('tts-rvc-model', selectedRvcModelName.value)
  localStorage.setItem('tts-rvc-index', selectedRvcIndexName.value)
  localStorage.setItem('tts-voice-prompt', selectedPromptId.value || 'default')
  localStorage.setItem('tts-rvc-index-rate', String(rvcIndexRate.value))
  localStorage.setItem('tts-rvc-protect', String(rvcProtect.value))
  localStorage.setItem('tts-rvc-rms-mix-rate', String(rvcRmsMixRate.value))
  localStorage.setItem('tts-rvc-f0-up-key', String(rvcF0UpKey.value))
  localStorage.setItem('tts-speed', String(ttsSpeed.value))
  localStorage.setItem(
    'tts-voice',
    rvcEnabled.value ? selectedRvcModelName.value : selectedEdgeVoice.value,
  )
  window.dispatchEvent(new CustomEvent('tts-settings-change'))
  if (notify) emit('toast', '语音设置已保存')
}

function saveVolume(): void {
  localStorage.setItem('tts-volume', String(ttsVolume.value))
  window.dispatchEvent(new CustomEvent('tts-volume-change', { detail: ttsVolume.value }))
}

function saveBaseEngine(): void {
  localStorage.setItem('tts-base-engine-v2', baseEngine.value)
  window.dispatchEvent(new CustomEvent('tts-base-engine-change-v2', { detail: baseEngine.value }))
  window.dispatchEvent(new CustomEvent('tts-settings-change'))
  emit('toast', baseEngine.value === 'edge_tts' ? '已切换为快速底音' : '已切换为本地底音')
}

const edgeVoices = computed(() =>
  (voices.value?.voices ?? []).filter((v) => v.engine === 'edge_tts' || !v.engine),
)

const rvcVoices = computed(() =>
  (voices.value?.voices ?? []).filter((v) => v.engine === 'rvc'),
)

const selectedRvcModel = computed(() =>
  rvcModels.value?.models?.find((model) => model.name === selectedRvcModelName.value) ?? null,
)

const selectedRvcIndex = computed(() =>
  selectedRvcIndexName.value
    || selectedRvcModel.value?.selected_index
    || selectedRvcModel.value?.indexes?.[0]?.filename
    || '',
)

function selectBaseEngine(engine: 'edge_tts' | 'cosyvoice'): void {
  baseEngine.value = engine
  saveBaseEngine()
}

const selectedVoicePrompt = computed(() =>
  voicePrompts.value.find((item) => item.id === selectedPromptId.value)
  ?? voicePrompts.value.find((item) => item.id === 'default')
  ?? null,
)

const selectedPromptTooLong = computed(
  () => (selectedVoicePrompt.value?.duration ?? 0) > PROMPT_MAX_DURATION_SECONDS,
)

const promptDirty = computed(() => {
  const prompt = selectedVoicePrompt.value
  if (!prompt || prompt.builtin) return false
  return (
    editPromptName.value.trim() !== prompt.name
    || editPromptText.value.trim() !== prompt.text.trim()
  )
})

function syncPromptDrafts(): void {
  editPromptName.value = selectedVoicePrompt.value?.name ?? ''
  editPromptText.value = selectedVoicePrompt.value?.text ?? ''
}

function collapsePromptEditor(): void {
  promptEditorOpen.value = (
    selectedVoicePrompt.value?.text_source === 'missing'
  )
}

function resetPromptPreview(): void {
  const audio = promptAudio.value
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  promptPlaying.value = false
  promptCurrentTime.value = 0
  promptPlayerDuration.value = selectedVoicePrompt.value?.duration ?? 0
}

function togglePromptPreview(): void {
  const audio = promptAudio.value
  if (!audio || !selectedVoicePrompt.value?.audio_url) return
  if (audio.paused) {
    if (audio.ended || audio.currentTime >= audio.duration) audio.currentTime = 0
    void audio.play().catch((error) => {
      emit('error', error instanceof Error ? error.message : '参考音频播放失败')
    })
  } else {
    audio.pause()
  }
}

function updatePromptAudioMeta(): void {
  const duration = promptAudio.value?.duration
  if (Number.isFinite(duration) && (duration ?? 0) > 0) {
    promptPlayerDuration.value = duration ?? 0
  }
}

function updatePromptAudioTime(): void {
  promptCurrentTime.value = promptAudio.value?.currentTime ?? 0
}

function seekPromptAudio(event: Event): void {
  const target = event.target as HTMLInputElement
  const time = Number(target.value)
  if (!promptAudio.value || !Number.isFinite(time)) return
  promptAudio.value.currentTime = time
  promptCurrentTime.value = time
}

function formatAudioClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const value = Math.floor(seconds)
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

async function loadVoicePrompts(): Promise<void> {
  loadingPrompts.value = true
  try {
    voicePrompts.value = await listVoicePrompts()
    if (!voicePrompts.value.some((item) => item.id === selectedPromptId.value)) {
      selectedPromptId.value = 'default'
    }
    syncPromptDrafts()
    resetPromptPreview()
    saveVoiceSettings(false)
  } catch (error) {
    voicePrompts.value = []
    emit('error', error instanceof Error ? error.message : '读取语气预设失败')
  } finally {
    loadingPrompts.value = false
  }
}

function selectVoicePrompt(): void {
  syncPromptDrafts()
  collapsePromptEditor()
  resetPromptPreview()
  saveVoiceSettings(false)
}

async function handlePromptUpload(file: File | undefined): Promise<void> {
  if (!file || uploadingPrompt.value) return
  if (file.size > 20 * 1024 * 1024) {
    emit('error', '语气参考音频不能超过 20 MB')
    return
  }
  if (!['.wav', '.mp3', '.flac', '.ogg', '.m4a'].includes(PathSuffix(file.name))) {
    emit('error', '只支持 WAV、MP3、FLAC、OGG、M4A 音频')
    return
  }
  uploadingPrompt.value = true
  try {
    const result = await uploadVoicePrompt(
      file,
      uploadPromptName.value,
      uploadPromptText.value,
      uploadDurationLimit.value,
    )
    selectedPromptId.value = result.prompt.id
    uploadPromptName.value = ''
    uploadPromptText.value = ''
    await loadVoicePrompts()
    promptEditorOpen.value = result.prompt.text_source === 'missing'
    emit(
      'toast',
      result.recognition_warning
        ? result.recognition_warning
        : '语气参考音频已上传并识别',
    )
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '语气参考音频上传失败')
  } finally {
    uploadingPrompt.value = false
    if (promptFileInput.value) promptFileInput.value.value = ''
  }
}

async function savePromptDetails(): Promise<void> {
  const prompt = selectedVoicePrompt.value
  if (!prompt || prompt.builtin || !promptDirty.value) return
  if (!editPromptName.value.trim()) {
    emit('error', '语气预设名称不能为空')
    return
  }
  promptBusyId.value = prompt.id
  try {
    const updated = await updateVoicePrompt(prompt.id, {
      name: editPromptName.value.trim(),
      text: editPromptText.value.trim(),
    })
    voicePrompts.value = voicePrompts.value.map((item) =>
      item.id === updated.id ? updated : item,
    )
    syncPromptDrafts()
    promptEditorOpen.value = false
    emit('toast', '语气预设已保存')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '语气预设保存失败')
  } finally {
    promptBusyId.value = ''
  }
}

async function recognizePrompt(): Promise<void> {
  const prompt = selectedVoicePrompt.value
  if (!prompt || prompt.builtin || promptBusyId.value) return
  promptBusyId.value = prompt.id
  try {
    const updated = await transcribeVoicePrompt(prompt.id)
    voicePrompts.value = voicePrompts.value.map((item) =>
      item.id === updated.id ? updated : item,
    )
    syncPromptDrafts()
    emit('toast', '参考文本已重新识别')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '参考文本识别失败')
  } finally {
    promptBusyId.value = ''
  }
}

async function removePrompt(): Promise<void> {
  const prompt = selectedVoicePrompt.value
  if (
    !prompt
    || prompt.builtin
    || promptBusyId.value
    || !window.confirm(`确认删除语气预设“${prompt.name}”？`)
  ) {
    return
  }
  promptBusyId.value = prompt.id
  try {
    await deleteVoicePrompt(prompt.id)
    selectedPromptId.value = 'default'
    await loadVoicePrompts()
    emit('toast', '语气预设已删除')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '语气预设删除失败')
  } finally {
    promptBusyId.value = ''
  }
}

function applyRvcTuningPreset(preset: 'target' | 'clean'): void {
  if (preset === 'target') {
    rvcIndexRate.value = 0.6
    rvcProtect.value = 0.4
  } else {
    rvcIndexRate.value = 0.35
    rvcProtect.value = 0.45
  }
  rvcRmsMixRate.value = 0.25
  rvcF0UpKey.value = 0
  localStorage.setItem('tts-rvc-profile', preset)
  saveVoiceSettings(false)
  emit(
    'toast',
    preset === 'target'
      ? '已应用“更像目标”参数'
      : '已应用“清晰防噪”参数',
  )
}

function saveRvcTuning(): void {
  localStorage.setItem('tts-rvc-profile', 'custom')
  saveVoiceSettings(false)
}

function formatPromptDuration(seconds: number | null): string {
  if (!seconds) return '--:--'
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function promptSourceLabel(source: VoicePromptTextSource): string {
  if (source === 'recognized') return '自动识别'
  if (source === 'manual') return '手动填写'
  if (source === 'missing') return '待补全文本'
  if (source === 'disabled') return '待识别'
  return '内置'
}

async function toggleRvcRuntime(): Promise<void> {
  if (changingRvcRuntime.value) return
  const desired = !rvcEnabled.value
  if (desired && !rvcModels.value?.models?.length) {
    emit('error', '请先上传至少一个 RVC .pth 模型')
    return
  }
  changingRvcRuntime.value = true
  try {
    const result = await setRVCRuntime(desired)
    rvcEnabled.value = result.enabled
    saveVoiceSettings(false)
    emit('toast', result.enabled ? 'RVC 已启用' : 'RVC 已关闭')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'RVC 状态切换失败')
  } finally {
    changingRvcRuntime.value = false
  }
}

function selectRvcModel(): void {
  if (
    selectedRvcIndexName.value
    && !selectedRvcModel.value?.indexes.some(
      (index) => index.filename === selectedRvcIndexName.value,
    )
  ) {
    selectedRvcIndexName.value = ''
  }
  saveVoiceSettings(false)
}

async function loadRVCModels(): Promise<void> {
  loadingRVCModels.value = true
  try {
    rvcModels.value = await listRVCModels()
    if (
      rvcModels.value.models.length
      && !rvcModels.value.models.some((model) => model.name === selectedRvcModelName.value)
    ) {
      selectedRvcModelName.value = rvcModels.value.models[0].name
      selectedRvcIndexName.value = ''
    }
    if (
      selectedRvcIndexName.value
      && !selectedRvcModel.value?.indexes.some(
        (index) => index.filename === selectedRvcIndexName.value,
      )
    ) {
      selectedRvcIndexName.value = ''
    }
    if (rvcModels.value.models.length) {
      try {
        const runtime = await setRVCRuntime(rvcEnabled.value)
        rvcEnabled.value = runtime.enabled
      } catch {
        // Keep the current preference; the next read will report availability.
      }
    } else {
      selectedRvcModelName.value = ''
      selectedRvcIndexName.value = ''
      rvcEnabled.value = false
      try {
        await setRVCRuntime(false)
      } catch {
        // The empty model list is still enough to keep RVC inactive in playback.
      }
    }
    saveVoiceSettings(false)
  } catch {
    rvcModels.value = null
  } finally {
    loadingRVCModels.value = false
  }
}

async function handleRVCModel(file: File | undefined): Promise<void> {
  if (!file || uploadingRVC.value) return
  const suf = PathSuffix(file.name)
  if (suf !== '.pth') {
    emit('error', '只接受 .pth 模型文件')
    return
  }
  uploadingRVC.value = true
  try {
    const result = await uploadRVCModel(file)
    selectedRvcModelName.value = result.model_name
    selectedRvcIndexName.value = ''
    saveVoiceSettings(false)
    emit('toast', `模型 ${result.model_name} 已上传${result.index_saved ? '（含索引）' : ''}`)
    await loadRVCModels()
    await loadVoices()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '模型上传失败')
  } finally {
    uploadingRVC.value = false
    if (rvcModelInput.value) rvcModelInput.value.value = ''
  }
}

async function handleRVCIndex(file: File | undefined): Promise<void> {
  if (!file || uploadingRVC.value) return
  if (PathSuffix(file.name) !== '.index') {
    emit('error', '只接受 .index 特征索引文件')
    return
  }
  if (!rvcModels.value?.models?.length) {
    emit('error', '请先上传对应的 .pth 模型文件')
    return
  }
  const model = rvcModels.value.models.find(
    (m) => m.name === selectedRvcModelName.value,
  ) ?? rvcModels.value.models[0]
  if (!model) {
    emit('error', '请先选择一个用于该索引的 .pth 模型')
    return
  }
  uploadingRVC.value = true
  try {
    const result = await uploadRVCIndex(model.name, file)
    selectedRvcModelName.value = model.name
    selectedRvcIndexName.value = result.index_saved
    saveVoiceSettings(false)
    emit('toast', `索引 ${result.index_saved} 已上传到模型 "${model.name}"`)
    await loadRVCModels()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '索引上传失败')
  } finally {
    uploadingRVC.value = false
    if (rvcIndexInput.value) rvcIndexInput.value.value = ''
  }
}

async function handleDeleteRVC(name: string): Promise<void> {
  if (!window.confirm(`确认删除 RVC 模型 "${name}" 及其关联的索引文件？`)) return
  try {
    const result = await deleteRVCModel(name)
    const msg = result.deleted_indexes.length
      ? `模型 ${name} 及索引 ${result.deleted_indexes.join(', ')} 已删除`
      : `模型 ${name} 已删除`
    emit('toast', msg)
    await loadRVCModels()
    await loadVoices()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '删除失败')
  }
}

async function handleRefreshRVC(): Promise<void> {
  refreshingRVC.value = true
  try {
    await refreshRVCVoices()
    await Promise.all([loadVoices(), loadRVCModels()])
    emit('toast', `已刷新，发现 ${rvcVoices.value.length} 个本地音色`)
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '刷新失败')
  } finally {
    refreshingRVC.value = false
  }
}

function PathSuffix(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx).toLowerCase() : ''
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const isDirty = computed(() => {
  if (!data.value) return false
  return draft.value.trim() !== data.value.prompt.trim()
})

const charCount = computed(() => draft.value.length)
const brandDirty = computed(
  () => !!branding.value && brandNameDraft.value.trim() !== branding.value.name,
)

async function load(): Promise<void> {
  loading.value = true
  savingState.value = 'idle'
  try {
    data.value = await getPromptSettings()
    draft.value = data.value.prompt
    branding.value = await getBranding()
    brandNameDraft.value = branding.value.name
    await loadMedia()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '加载性格设定失败')
  } finally {
    loading.value = false
  }
}

async function loadMedia(): Promise<void> {
  loadingMedia.value = true
  try {
    mediaItems.value = await listBrandingMedia()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '读取媒体库失败')
  } finally {
    loadingMedia.value = false
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function applyMedia(
  item: BrandingMediaItem,
  target: 'logo' | 'background',
): Promise<void> {
  mediaBusy.value = `${item.kind}:${item.filename}`
  try {
    branding.value = await useBrandingMedia(
      item.kind,
      item.filename,
      target,
    )
    emit('brandingUpdated', branding.value)
    await loadMedia()
    emit(
      'toast',
      item.kind === 'video'
        ? '视频背景已启用'
        : target === 'logo'
          ? '已设为助手图标'
          : '图片背景已启用',
    )
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '切换媒体失败')
  } finally {
    mediaBusy.value = ''
  }
}

async function removeMedia(item: BrandingMediaItem): Promise<void> {
  const hint =
    item.usage.length > 0
      ? '该媒体正在使用，删除后会立即恢复默认显示。确认删除？'
      : '确认从后端删除这个媒体文件？'
  if (!window.confirm(hint)) return
  mediaBusy.value = `${item.kind}:${item.filename}`
  try {
    branding.value = await deleteBrandingMedia(item.kind, item.filename)
    emit('brandingUpdated', branding.value)
    await loadMedia()
    emit('toast', '媒体文件已删除')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '删除媒体失败')
  } finally {
    mediaBusy.value = ''
  }
}

async function saveBrandingName(): Promise<void> {
  const name = brandNameDraft.value.trim()
  if (!name || !brandDirty.value || savingBrand.value) return
  savingBrand.value = true
  try {
    branding.value = await updateBrandingName(name)
    brandNameDraft.value = branding.value.name
    emit('brandingUpdated', branding.value)
    emit('toast', '助手名称已更新')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '名称保存失败')
  } finally {
    savingBrand.value = false
  }
}

async function handleLogo(file: File | undefined): Promise<void> {
  if (!file || uploadingLogo.value) return
  uploadingLogo.value = true
  try {
    branding.value = await uploadBrandingLogo(file)
    emit('brandingUpdated', branding.value)
    await loadMedia()
    emit('toast', '助手图片已上传到后端')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '图片上传失败')
  } finally {
    uploadingLogo.value = false
    if (logoInput.value) logoInput.value.value = ''
  }
}

async function restoreLogo(): Promise<void> {
  if (!branding.value?.logo_url || !window.confirm('恢复默认助手图标？')) return
  uploadingLogo.value = true
  try {
    branding.value = await resetBrandingLogo()
    emit('brandingUpdated', branding.value)
    await loadMedia()
    emit('toast', '已恢复默认助手图标')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '恢复图标失败')
  } finally {
    uploadingLogo.value = false
  }
}

async function toggleBackground(): Promise<void> {
  if (!branding.value?.logo_url) return
  savingBrand.value = true
  try {
    branding.value = await setBrandingBackground(
      !(
        branding.value.background_enabled &&
        branding.value.background_type === 'image'
      ),
      'image',
    )
    emit('brandingUpdated', branding.value)
    emit(
      'toast',
      branding.value.background_enabled
        ? '已将上传图片设为页面背景'
        : '已取消页面背景',
    )
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '背景设置失败')
  } finally {
    savingBrand.value = false
  }
}

async function handleVideo(file: File | undefined): Promise<void> {
  if (!file || uploadingVideo.value) return
  if (file.size > 10 * 1024 * 1024 * 1024) {
    emit('error', '背景视频不能超过 10 GB')
    return
  }
  uploadingVideo.value = true
  videoUploadProgress.value = 0
  try {
    branding.value = await uploadBrandingVideo(file, (percent) => {
      videoUploadProgress.value = percent
    })
    emit('brandingUpdated', branding.value)
    await loadMedia()
    emit('toast', '视频已上传并设为播放背景')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '视频上传失败')
  } finally {
    uploadingVideo.value = false
    if (videoInput.value) videoInput.value.value = ''
  }
}

async function toggleVideoBackground(): Promise<void> {
  if (branding.value?.background_type !== 'video') return
  savingBrand.value = true
  try {
    branding.value = await setBrandingBackground(
      !branding.value.background_enabled,
      'video',
    )
    emit('brandingUpdated', branding.value)
    emit(
      'toast',
      branding.value.background_enabled ? '视频背景已启用' : '视频背景已暂停',
    )
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '背景设置失败')
  } finally {
    savingBrand.value = false
  }
}

async function save(): Promise<void> {
  if (!isDirty.value || !draft.value.trim()) return
  saving.value = true
  savingState.value = 'idle'
  try {
    const result = await updatePrompt(draft.value.trim())
    data.value = result
    draft.value = result.prompt
    savingState.value = 'saved'
    emit('toast', '性格设定已更新，下次对话生效')
    setTimeout(() => { savingState.value = 'idle' }, 2000)
  } catch (error) {
    savingState.value = 'error'
    emit('error', error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function restoreDefault(): Promise<void> {
  if (!window.confirm('恢复默认性格设定？你的自定义性格描述将被清除。')) return
  saving.value = true
  try {
    const result = await resetPrompt()
    data.value = result
    draft.value = result.prompt
    emit('toast', '已恢复默认性格设定')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '恢复默认失败')
  } finally {
    saving.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void load()
      void loadVoices()
      void loadVoicePrompts()
      void loadRVCModels()
    } else {
      resetPromptPreview()
    }
  },
)
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="drawer-shell">
      <div class="drawer-scrim" @click="emit('close')" />
      <aside class="knowledge-drawer prompt-drawer">
        <header>
          <div>
            <p class="eyebrow">ASSISTANT IDENTITY</p>
            <h2>助手设置</h2>
          </div>
          <button class="icon-button" aria-label="关闭性格设定" @click="emit('close')">×</button>
        </header>

        <section class="branding-section">
          <div class="voice-header">
            <p class="eyebrow">BRAND</p>
            <h3>名称与图片</h3>
          </div>
          <div class="branding-editor">
            <div class="branding-preview">
              <img
                v-if="branding?.logo_url"
                :src="branding.logo_url"
                alt="助手图片预览"
              />
              <span v-else>{{ brandNameDraft.trim().slice(0, 1) || 'N' }}</span>
            </div>
            <div class="branding-fields">
              <label>
                <span>助手名称</span>
                <input
                  v-model="brandNameDraft"
                  maxlength="32"
                  placeholder="Nebula"
                  @keydown.enter="saveBrandingName"
                />
              </label>
              <div class="branding-actions">
                <input
                  ref="logoInput"
                  class="branding-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  @change="handleLogo(($event.target as HTMLInputElement).files?.[0])"
                />
                <button
                  class="btn-upload"
                  :disabled="uploadingLogo"
                  @click="logoInput?.click()"
                >
                  {{ uploadingLogo ? '上传中...' : '上传图片' }}
                </button>
                <button
                  v-if="branding?.logo_url"
                  class="btn-reset"
                  :disabled="uploadingLogo"
                  @click="restoreLogo"
                >
                  默认图标
                </button>
                <button
                  v-if="branding?.logo_url"
                  class="btn-background"
                  :class="{
                    active:
                      branding.background_enabled &&
                      branding.background_type === 'image',
                  }"
                  :disabled="savingBrand"
                  @click="toggleBackground"
                >
                  {{
                    branding.background_enabled &&
                    branding.background_type === 'image'
                      ? '取消图片背景'
                      : '设为图片背景'
                  }}
                </button>
                <input
                  ref="videoInput"
                  class="branding-file-input"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  @change="handleVideo(($event.target as HTMLInputElement).files?.[0])"
                />
                <button
                  class="btn-upload"
                  :disabled="uploadingVideo"
                  @click="videoInput?.click()"
                >
                  {{
                    uploadingVideo
                      ? `上传视频 ${videoUploadProgress}%`
                      : '上传视频'
                  }}
                </button>
                <button
                  v-if="branding?.background_type === 'video'"
                  class="btn-background"
                  :class="{ active: branding.background_enabled }"
                  :disabled="savingBrand"
                  @click="toggleVideoBackground"
                >
                  {{ branding.background_enabled ? '暂停视频背景' : '启用视频背景' }}
                </button>
                <button
                  class="btn-save"
                  :disabled="!brandDirty || savingBrand"
                  @click="saveBrandingName"
                >
                  {{ savingBrand ? '保存中...' : '保存名称' }}
                </button>
              </div>
            </div>
          </div>

        <div v-if="videoEnabled" class="video-playback-panel">
            <div class="video-playback-heading">
              <div>
                <p class="eyebrow">BACKGROUND VIDEO</p>
                <h3>背景声音控制</h3>
                <p class="video-playback-caption">
                  播放进度可在右下角圆环中查看
                </p>
              </div>
              <span
                class="video-playback-status"
                :class="{ 'is-muted': videoMuted }"
                role="status"
              >
                <i aria-hidden="true" />
                {{ videoMuted ? '已静音' : '声音开启' }}
              </span>
            </div>

            <div class="video-sound-control" :class="{ 'is-muted': videoMuted }">
              <button
                class="video-sound-toggle"
                :aria-label="videoMuted ? '开启背景视频声音' : '关闭背景视频声音'"
                :aria-pressed="videoMuted"
                :title="videoMuted ? '开启声音' : '静音'"
                @click="emit('videoToggleMute')"
              >
                <svg v-if="videoMuted" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6" />
                </svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 5 6 9H3v6h3l5 4zM14 8.5a4 4 0 0 1 0 7M17 6a7 7 0 0 1 0 12" />
                </svg>
              </button>

              <div class="video-sound-track">
                <div class="video-sound-meta">
                  <span>背景视频音量</span>
                  <strong>
                    {{ videoMuted ? '静音' : `${Math.round((videoVolume ?? 0.5) * 100)}%` }}
                  </strong>
                </div>
                <input
                  class="video-playback-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="videoVolume ?? 0.5"
                  :disabled="videoMuted"
                  :style="{ '--pct': `${(videoVolume ?? 0.5) * 100}%` }"
                  aria-label="背景视频音量"
                  @input="emit('videoVolumeChange', Number(($event.target as HTMLInputElement).value))"
                />
              </div>
            </div>
          </div>

        <section class="voice-section" aria-labelledby="voice-settings-title">
          <div class="voice-header">
            <div class="voice-heading">
              <span class="voice-heading-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
                </svg>
              </span>
              <div>
                <p class="eyebrow">VOICE OUTPUT</p>
                <h3 id="voice-settings-title">朗读语音</h3>
                <p class="voice-subtitle">为 AI 回复选择音色，并调整播放音量。</p>
              </div>
            </div>
            <span
              v-if="voices?.configured"
              class="voice-status"
              role="status"
            >
              <i aria-hidden="true" />
              已就绪
            </span>
          </div>

          <div v-if="loadingVoices" class="prompt-loading">
            <span v-for="i in 3" :key="i" class="skeleton-line" />
          </div>
          <div v-else-if="!voices?.configured" class="voice-unavailable">
            <span class="voice-unavailable-icon" aria-hidden="true">!</span>
            <div>
              <strong>语音服务暂不可用</strong>
              <p>{{ voices?.message || '请确认后端语音依赖已安装，并检查网络连接。' }}</p>
            </div>
          </div>
          <div v-else class="voice-picker">
            <div class="voice-engine-panel">
              <div class="voice-panel-heading">
                <div>
                  <span class="voice-label">底音引擎</span>
                  <span class="voice-label-hint">生成普通语音；RVC 可在此基础上独立启用</span>
                </div>
                <span class="voice-base-engine-current">
                  {{ baseEngine === 'edge_tts' ? '快速' : '本地' }}
                </span>
              </div>
              <div class="voice-engine-toggle" role="radiogroup" aria-label="选择底音引擎">
                <button
                  type="button"
                  :class="{ 'is-active': baseEngine === 'edge_tts' }"
                  :aria-pressed="baseEngine === 'edge_tts'"
                  @click="selectBaseEngine('edge_tts')"
                >
                  <strong>Edge TTS</strong>
                  <span>在线 · 速度优先</span>
                </button>
                <button
                  type="button"
                  :class="{ 'is-active': baseEngine === 'cosyvoice' }"
                  :aria-pressed="baseEngine === 'cosyvoice'"
                  @click="selectBaseEngine('cosyvoice')"
                >
                  <strong>CosyVoice2</strong>
                  <span>本地 · 音质优先</span>
                </button>
              </div>

              <div v-if="baseEngine === 'edge_tts'" class="voice-field">
                <label class="voice-label" for="edge-voice-select">Edge 音色</label>
                <div class="voice-select-wrap">
                  <select
                    id="edge-voice-select"
                    v-model="selectedEdgeVoice"
                    class="voice-select"
                    @change="saveVoiceSettings(false)"
                  >
                    <option value="">使用默认在线音色</option>
                    <option
                      v-for="v in edgeVoices"
                      :key="v.id"
                      :value="v.id"
                    >
                      {{ v.name }}
                    </option>
                  </select>
                  <svg class="voice-select-chevron" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="m4 6 4 4 4-4" />
                  </svg>
                </div>
              </div>
              <div v-else class="voice-prompt-panel">
                <div class="voice-prompt-heading">
                  <div>
                    <span class="voice-label">语气参考</span>
                    <span class="voice-label-hint">
                      参考音频决定语气、节奏和情绪；参考文本用于零样本对齐
                    </span>
                  </div>
                  <span class="voice-prompt-count">
                    {{ voicePrompts.length }} 个
                  </span>
                </div>

                <div v-if="loadingPrompts" class="voice-prompt-loading">
                  <span v-for="i in 2" :key="i" class="skeleton-line" />
                </div>
                <template v-else>
                  <div class="voice-prompt-select-row">
                    <div class="voice-field">
                      <label class="voice-label" for="voice-prompt-select">
                        当前语气预设
                      </label>
                      <div class="voice-select-wrap">
                        <select
                          id="voice-prompt-select"
                          v-model="selectedPromptId"
                          class="voice-select"
                          :disabled="!voicePrompts.length"
                          @change="selectVoicePrompt"
                        >
                          <option
                            v-for="prompt in voicePrompts"
                            :key="prompt.id"
                            :value="prompt.id"
                          >
                            {{ prompt.name }}
                          </option>
                        </select>
                        <svg
                          class="voice-select-chevron"
                          viewBox="0 0 16 16"
                          aria-hidden="true"
                        >
                          <path d="m4 6 4 4 4-4" />
                        </svg>
                      </div>
                    </div>

                    <div class="voice-prompt-preview">
                      <span class="voice-label">参考音频</span>
                      <div
                        v-if="selectedVoicePrompt?.audio_url"
                        class="voice-prompt-player"
                        :class="{ 'is-too-long': selectedPromptTooLong }"
                      >
                        <audio
                          ref="promptAudio"
                          :key="selectedVoicePrompt.id"
                          :src="selectedVoicePrompt.audio_url"
                          preload="metadata"
                          @loadedmetadata="updatePromptAudioMeta"
                          @timeupdate="updatePromptAudioTime"
                          @durationchange="updatePromptAudioMeta"
                          @play="promptPlaying = true"
                          @pause="promptPlaying = false"
                          @ended="promptPlaying = false"
                        />
                        <button
                          type="button"
                          class="voice-prompt-play"
                          :aria-label="promptPlaying ? '暂停参考音频' : '播放参考音频'"
                          @click="togglePromptPreview"
                        >
                          <svg v-if="promptPlaying" viewBox="0 0 20 20" aria-hidden="true">
                            <path d="M6.5 4.5v11M13.5 4.5v11" />
                          </svg>
                          <svg v-else viewBox="0 0 20 20" aria-hidden="true">
                            <path d="m7 4.5 8 5.5-8 5.5z" />
                          </svg>
                        </button>
                        <div class="voice-prompt-player-track">
                          <input
                            type="range"
                            min="0"
                            :max="Math.max(promptPlayerDuration, 0.01)"
                            step="0.05"
                            :value="Math.min(promptCurrentTime, promptPlayerDuration)"
                            :style="{
                              '--pct': `${promptPlayerDuration ? Math.min(100, promptCurrentTime / promptPlayerDuration * 100) : 0}%`,
                            }"
                            aria-label="参考音频播放进度"
                            @input="seekPromptAudio"
                          />
                          <div>
                            <span>{{ formatAudioClock(promptCurrentTime) }}</span>
                            <span v-if="selectedPromptTooLong" class="is-warning">过长</span>
                            <span v-else>{{ formatAudioClock(promptPlayerDuration) }}</span>
                          </div>
                        </div>
                      </div>
                      <span v-else class="voice-prompt-preview-empty">
                        暂无可用音频
                      </span>
                    </div>
                  </div>

                  <div
                    v-if="selectedVoicePrompt"
                    class="voice-prompt-compact"
                    :class="{
                      'is-missing': selectedVoicePrompt.text_source === 'missing',
                      'is-too-long': selectedPromptTooLong,
                    }"
                  >
                    <span class="voice-prompt-meta-state" aria-hidden="true">
                      {{
                        selectedPromptTooLong || selectedVoicePrompt.text_source === 'missing'
                          ? '!'
                          : '✓'
                      }}
                    </span>
                    <div class="voice-prompt-compact-copy">
                      <strong>
                        {{
                          selectedPromptTooLong
                            ? '参考音频过长'
                            : promptSourceLabel(selectedVoicePrompt.text_source)
                        }}
                      </strong>
                      <small>
                        {{ formatPromptDuration(selectedVoicePrompt.duration) }}
                        · {{ selectedVoicePrompt.text.length }} 字
                      </small>
                    </div>
                    <div
                      v-if="!selectedVoicePrompt.builtin"
                      class="voice-prompt-compact-actions"
                    >
                      <button
                        type="button"
                        @click="promptEditorOpen = !promptEditorOpen"
                      >
                        {{ promptEditorOpen ? '收起' : '编辑' }}
                      </button>
                      <button
                        type="button"
                        class="is-danger"
                        :disabled="!!promptBusyId"
                        @click="removePrompt"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  <div
                    v-if="promptEditorOpen && selectedVoicePrompt && !selectedVoicePrompt.builtin"
                    class="voice-prompt-editor"
                  >
                    <div class="voice-prompt-editor-body">
                      <label>
                        <span class="voice-label">预设名称</span>
                        <input
                          v-model="editPromptName"
                          class="voice-text-input"
                          maxlength="64"
                          placeholder="例如：温柔聊天"
                        />
                      </label>
                      <label>
                        <span class="voice-label">
                          参考文本
                          <small>必须对应参考音频中实际说出的内容</small>
                        </span>
                        <textarea
                          v-model="editPromptText"
                          class="voice-prompt-textarea"
                          rows="3"
                          placeholder="输入参考音频中实际说出的文字"
                        />
                      </label>
                      <div class="voice-prompt-actions">
                        <button
                          type="button"
                          class="btn-prompt-secondary"
                          :disabled="!!promptBusyId"
                          @click="recognizePrompt"
                        >
                          {{ promptBusyId === selectedVoicePrompt.id ? '处理中...' : '重新识别' }}
                        </button>
                        <button
                          type="button"
                          class="btn-prompt-save"
                          :disabled="!promptDirty || !!promptBusyId"
                          @click="savePromptDetails"
                        >
                          {{ promptBusyId === selectedVoicePrompt.id ? '保存中...' : '保存' }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <details class="voice-prompt-upload">
                    <summary class="voice-prompt-upload-summary">
                      <span>
                        <strong>添加语气片段</strong>
                        <small>建议 3–15 秒，最大 30 秒 / 20 MB</small>
                      </span>
                      <span class="voice-prompt-editor-action">
                        展开
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="m4 6 4 4 4-4" />
                        </svg>
                      </span>
                    </summary>
                    <div class="voice-prompt-upload-body">
                      <input
                        ref="promptFileInput"
                        type="file"
                        accept=".wav,.mp3,.flac,.ogg,.m4a,audio/*"
                        class="voice-file-input"
                        @change="handlePromptUpload(($event.target as HTMLInputElement).files?.[0])"
                      />
                      <div class="voice-prompt-upload-fields">
                        <label class="voice-prompt-upload-field">
                          <span>参考音频名称</span>
                          <input
                            v-model="uploadPromptName"
                            class="voice-text-input"
                            maxlength="64"
                            placeholder="可选"
                          />
                        </label>
                        <label class="voice-prompt-upload-field">
                          <span>时长上限</span>
                          <select
                            v-model.number="uploadDurationLimit"
                            class="voice-select"
                          >
                            <option :value="3">3 秒</option>
                            <option :value="5">5 秒</option>
                            <option :value="8">8 秒</option>
                            <option :value="10">10 秒</option>
                            <option :value="15">15 秒（推荐）</option>
                            <option :value="20">20 秒</option>
                            <option :value="25">25 秒</option>
                            <option :value="30">30 秒</option>
                          </select>
                        </label>
                        <label class="voice-prompt-upload-field is-wide">
                          <span>参考文本</span>
                          <textarea
                            v-model="uploadPromptText"
                            class="voice-prompt-textarea"
                            maxlength="500"
                            rows="2"
                            placeholder="可选；留空时上传后自动识别"
                          />
                        </label>
                      </div>
                      <div class="voice-prompt-upload-actions">
                        <span>超过 15 秒容易泄漏 prompt，请先自行裁剪</span>
                        <button
                          type="button"
                          class="btn-prompt-upload"
                          :disabled="uploadingPrompt"
                          @click="promptFileInput?.click()"
                        >
                          {{ uploadingPrompt ? '上传并识别中...' : '选择音频并上传' }}
                        </button>
                      </div>
                    </div>
                  </details>
                </template>
              </div>
            </div>

            <div class="rvc-control-panel" :class="{ 'is-disabled': !rvcEnabled }">
              <div class="voice-panel-heading">
                <div class="rvc-control-title">
                  <span class="voice-engine-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
                    </svg>
                  </span>
                  <div>
                    <span class="voice-label">RVC 音色转换</span>
                    <span class="voice-label-hint">可独立开启或关闭，不影响底音引擎</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="rvc-runtime-toggle"
                  :class="{ 'is-on': rvcEnabled }"
                  role="switch"
                  :aria-checked="rvcEnabled"
                  :disabled="changingRvcRuntime"
                  @click="toggleRvcRuntime"
                >
                  <span aria-hidden="true"><i /></span>
                  {{ changingRvcRuntime ? '切换中' : (rvcEnabled ? '已启用' : '已关闭') }}
                </button>
              </div>

              <div v-if="rvcEnabled" class="rvc-selection-grid">
                <div class="voice-field">
                  <label class="voice-label" for="rvc-model-select">音色模型（.pth）</label>
                  <div class="voice-select-wrap">
                    <select
                      id="rvc-model-select"
                      v-model="selectedRvcModelName"
                      class="voice-select"
                      :disabled="!rvcModels?.models?.length"
                      @change="selectRvcModel"
                    >
                      <option v-if="!rvcModels?.models?.length" value="">暂无本地模型</option>
                      <option
                        v-for="model in rvcModels?.models ?? []"
                        :key="model.name"
                        :value="model.name"
                      >
                        {{ model.name }}
                      </option>
                    </select>
                    <svg class="voice-select-chevron" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </div>
                </div>
                <div class="voice-field">
                  <label class="voice-label" for="rvc-index-select">特征索引（.index）</label>
                  <div class="voice-select-wrap">
                    <select
                      id="rvc-index-select"
                      v-model="selectedRvcIndexName"
                      class="voice-select"
                      :disabled="!selectedRvcModel?.indexes?.length"
                      @change="saveVoiceSettings(false)"
                    >
                      <option value="">自动匹配最新索引</option>
                      <option
                        v-for="index in selectedRvcModel?.indexes ?? []"
                        :key="index.filename"
                        :value="index.filename"
                      >
                        {{ index.filename }}
                      </option>
                    </select>
                    <svg class="voice-select-chevron" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </div>
                </div>
              </div>

              <div
                v-if="rvcEnabled"
                class="voice-index-card"
                :class="{ 'is-missing': !selectedRvcIndex }"
              >
                <span class="voice-index-state" aria-hidden="true">
                  {{ selectedRvcIndex ? '✓' : '!' }}
                </span>
                <div>
                  <span>{{ selectedRvcIndexName ? '手动选择的 RVC 索引' : '自动匹配的 RVC 索引' }}</span>
                  <strong :title="selectedRvcIndex">
                    {{ selectedRvcIndex || '未找到匹配的 .index 文件' }}
                  </strong>
                  <small v-if="selectedRvcIndex">
                    {{ selectedRvcIndexName ? '将使用当前手动选择的索引。' : '同名模型有多个索引时，自动使用最新文件。' }}
                  </small>
                  <small v-else>可先在下方上传与模型对应的 .index 文件。</small>
                </div>
              </div>

              <div v-if="rvcEnabled" class="rvc-parameter-panel">
                <div class="rvc-parameter-heading">
                  <div>
                    <span class="voice-label">转换参数</span>
                    <span class="voice-label-hint">
                      只影响音色转换；语气主要由 CosyVoice2 参考音频决定
                    </span>
                  </div>
                  <div class="rvc-profile-actions">
                    <button
                      type="button"
                      class="btn-rvc-reset"
                      @click="applyRvcTuningPreset('clean')"
                    >
                      清晰防噪
                    </button>
                    <button
                      type="button"
                      class="btn-rvc-reset is-preferred"
                      @click="applyRvcTuningPreset('target')"
                    >
                      更像目标
                    </button>
                  </div>
                </div>

                <div class="rvc-parameter-grid">
                  <label class="rvc-parameter">
                    <span>
                      <strong>索引融合</strong>
                      <output>{{ rvcIndexRate.toFixed(2) }}</output>
                    </span>
                    <input
                      v-model.number="rvcIndexRate"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      :style="{ '--pct': `${rvcIndexRate * 100}%` }"
                      @change="saveRvcTuning"
                    />
                    <small>0.20–0.35 更稳；超过 0.60 容易金属音或电流感</small>
                  </label>

                  <label class="rvc-parameter">
                    <span>
                      <strong>音素保护</strong>
                      <output>{{ rvcProtect.toFixed(2) }}</output>
                    </span>
                    <input
                      v-model.number="rvcProtect"
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.01"
                      :style="{ '--pct': `${rvcProtect * 200}%` }"
                      @change="saveRvcTuning"
                    />
                    <small>0.40–0.49 保留清辅音；0.50 会关闭保护</small>
                  </label>

                  <label class="rvc-parameter">
                    <span>
                      <strong>音量包络</strong>
                      <output>{{ rvcRmsMixRate.toFixed(2) }}</output>
                    </span>
                    <input
                      v-model.number="rvcRmsMixRate"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      :style="{ '--pct': `${rvcRmsMixRate * 100}%` }"
                      @change="saveRvcTuning"
                    />
                    <small>0.20–0.30 保留底音音量变化，减少忽大忽小</small>
                  </label>

                  <label class="rvc-parameter">
                    <span>
                      <strong>音高偏移</strong>
                      <output>{{ rvcF0UpKey > 0 ? '+' : '' }}{{ rvcF0UpKey }} 半音</output>
                    </span>
                    <input
                      v-model.number="rvcF0UpKey"
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      :style="{ '--pct': `${(rvcF0UpKey + 12) / 24 * 100}%` }"
                      @change="saveRvcTuning"
                    />
                    <small>仅在转换后音高明显偏低或偏高时调整</small>
                  </label>
                </div>
              </div>
            </div>

            <div class="voice-volume-card">
              <div class="voice-volume-heading">
                <span class="voice-volume-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M11 5 6 9H3v6h3l5 4z" />
                    <path d="M14.5 9a4.5 4.5 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" />
                  </svg>
                </span>
                <div>
                  <label class="voice-label" for="tts-volume">朗读音量</label>
                  <span class="voice-label-hint">仅影响消息朗读</span>
                </div>
                <output class="voice-volume-value" for="tts-volume">
                  {{ Math.round(ttsVolume * 100) }}%
                </output>
              </div>
              <div class="voice-volume-wrap">
                <input
                  id="tts-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  v-model.number="ttsVolume"
                  class="voice-volume-slider"
                  :style="{ '--pct': `${ttsVolume * 100}%` }"
                  @change="saveVolume"
                />
              </div>
            </div>

            <div class="voice-volume-card voice-speed-card">
              <div class="voice-volume-heading">
                <span class="voice-volume-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 16a8 8 0 0 1 16 0M7 16a5 5 0 0 1 10 0M10 16a2 2 0 0 1 4 0" />
                    <path d="M12 16v4" />
                  </svg>
                </span>
                <div>
                  <label class="voice-label" for="tts-speed">朗读语速</label>
                  <span class="voice-label-hint">
                    所有 CosyVoice 分段使用同一速度
                  </span>
                </div>
                <output class="voice-volume-value" for="tts-speed">
                  {{ Math.round(ttsSpeed * 100) }}%
                </output>
              </div>
              <div class="voice-volume-wrap">
                <input
                  id="tts-speed"
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.05"
                  v-model.number="ttsSpeed"
                  class="voice-volume-slider"
                  :style="{ '--pct': `${(ttsSpeed - 0.7) / 0.6 * 100}%` }"
                  @change="saveVoiceSettings(false)"
                />
              </div>
              <p class="voice-speed-note">
                建议 90%–100%。需要放慢时在这里设置，不建议继续把“语速放慢”写进风格要求。
              </p>
            </div>

            <p class="voice-hint">
              设置保存在当前浏览器中。每条 AI 消息旁的朗读按钮会使用这里的音色与音量。
            </p>

            <details class="rvc-model-section">
              <summary class="rvc-model-header">
                <span class="rvc-model-summary">
                  <span class="rvc-model-summary-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zM4 7.5l8 4.5 8-4.5M12 12v9" />
                    </svg>
                  </span>
                  <span class="rvc-model-summary-copy">
                    <strong>RVC 模型管理</strong>
                    <small>上传与整理本地变声音色</small>
                  </span>
                </span>
                <span class="rvc-model-count">
                  {{ rvcModels?.models?.length ?? 0 }} 个模型
                </span>
              </summary>

              <div class="rvc-model-body">
                <div class="rvc-model-toolbar">
                  <p>模型文件保存在后端本地。</p>
                  <button
                    class="btn-refresh-rvc"
                    :disabled="refreshingRVC"
                    @click="handleRefreshRVC"
                  >
                    {{ refreshingRVC ? '刷新中...' : '刷新列表' }}
                  </button>
                </div>

                <div v-if="loadingRVCModels" class="rvc-loading">
                  <span v-for="i in 2" :key="i" class="skeleton-line" />
                </div>

                <template v-else>
                  <div class="rvc-upload-area">
                    <div class="rvc-upload-row">
                      <input
                        ref="rvcModelInput"
                        type="file"
                        accept=".pth"
                        class="rvc-file-input"
                        @change="handleRVCModel(($event.target as HTMLInputElement).files?.[0])"
                      />
                      <button
                        class="btn-upload-rvc"
                        :disabled="uploadingRVC"
                        @click="rvcModelInput?.click()"
                      >
                        {{ uploadingRVC ? '上传中...' : '上传 .pth 模型' }}
                      </button>
                      <input
                        ref="rvcIndexInput"
                        type="file"
                        accept=".index"
                        class="rvc-file-input"
                        @change="handleRVCIndex(($event.target as HTMLInputElement).files?.[0])"
                      />
                      <button
                        class="btn-upload-rvc"
                        :disabled="uploadingRVC"
                        @click="rvcIndexInput?.click()"
                      >
                        {{ uploadingRVC ? '上传中...' : '上传 .index 索引' }}
                      </button>
                    </div>
                    <p class="rvc-hint">
                      索引文件名应与模型名称对应；上传后刷新即可在“本地音色”中选择。
                    </p>
                  </div>

                  <div v-if="rvcModels?.models?.length" class="rvc-model-list">
                    <div
                      v-for="m in rvcModels.models"
                      :key="m.name"
                      class="rvc-model-item"
                    >
                      <span class="rvc-model-avatar" aria-hidden="true">
                        {{ m.name.slice(0, 1).toUpperCase() }}
                      </span>
                      <div class="rvc-model-info">
                        <strong :title="m.name">{{ m.name }}</strong>
                        <span class="rvc-model-meta">
                          {{ formatSize(m.pth_size_bytes) }}
                          <template v-if="m.selected_index">
                            · 自动索引: {{ m.selected_index }}
                          </template>
                          <template v-else-if="m.indexes.length">
                            · {{ m.indexes.length }} 个可用索引
                          </template>
                          <template v-else>· 未配置索引</template>
                        </span>
                      </div>
                      <button
                        class="btn-delete-rvc"
                        :aria-label="`删除模型 ${m.name}`"
                        @click="handleDeleteRVC(m.name)"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div v-else class="rvc-empty">
                    <span aria-hidden="true">◎</span>
                    <p>还没有本地模型，上传后可生成专属朗读音色。</p>
                  </div>
                </template>
              </div>
            </details>
          </div>
        </section>
          <div class="media-library-heading">
            <div>
              <p class="eyebrow">MEDIA LIBRARY</p>
              <h3>已上传媒体</h3>
            </div>
            <span>{{ mediaItems.length }} 个文件</span>
          </div>
          <div v-if="loadingMedia" class="media-library-loading">
            <span v-for="i in 4" :key="i" />
          </div>
          <div v-else-if="mediaItems.length" class="media-library-grid">
            <article
              v-for="item in mediaItems"
              :key="`${item.kind}:${item.filename}`"
              class="media-card"
              :class="{ 'media-card--active': item.usage.length }"
            >
              <div class="media-preview">
                <img
                  v-if="item.kind === 'image'"
                  :src="item.url"
                  :alt="item.filename"
                />
                <video
                  v-else
                  :src="item.url"
                  muted
                  playsinline
                  preload="metadata"
                />
                <span class="media-kind">{{ item.kind === 'video' ? 'VIDEO' : 'IMAGE' }}</span>
                <span v-if="item.usage.length" class="media-used">
                  {{ item.usage.includes('logo') ? '正在使用图标' : '正在使用背景' }}
                </span>
              </div>
              <div class="media-card-copy">
                <strong :title="item.filename">
                  {{ item.kind === 'video' ? '背景视频' : '助手图片' }}
                </strong>
                <small>
                  {{ formatBytes(item.size_bytes) }} ·
                  {{ new Date(item.created_at).toLocaleDateString('zh-CN') }}
                </small>
              </div>
              <div class="media-card-actions">
                <button
                  v-if="item.kind === 'image'"
                  :disabled="mediaBusy === `${item.kind}:${item.filename}`"
                  @click="applyMedia(item, 'logo')"
                >
                  设为图标
                </button>
                <button
                  :disabled="mediaBusy === `${item.kind}:${item.filename}`"
                  @click="applyMedia(item, 'background')"
                >
                  {{ item.kind === 'video' ? '设为视频背景' : '设为图片背景' }}
                </button>
                <button
                  class="media-delete"
                  :disabled="mediaBusy === `${item.kind}:${item.filename}`"
                  @click="removeMedia(item)"
                >
                  删除
                </button>
              </div>
            </article>
          </div>
          <div v-else class="media-library-empty">
            还没有上传媒体，可从这里统一管理后续图片和视频。
          </div>

          <p class="branding-hint">
            图片支持 PNG、JPEG、WebP、GIF（最大 5 MB）；视频支持 MP4、MOV、WebM
            （最大 10 GB）。媒体文件保存在后端目录。
          </p>

        </section>

        <section class="personality-section">
          <div class="voice-header">
            <p class="eyebrow">PERSONALITY</p>
            <h3>性格设定</h3>
          </div>
        </section>

        <section class="prompt-explainer">
          <div class="prompt-status" :class="{ custom: data?.is_custom }">
            <span class="status-dot" />
            <span>{{ data?.is_custom ? '自定义性格' : '默认性格' }}</span>
          </div>
          <p>
            定义 AI 助手的性格、语气、说话方式。支持中英文。
            知识库检索、联网搜索和工具执行的规则由系统保护，不会被覆盖。
          </p>
        </section>

        <div v-if="loading" class="prompt-loading">
          <span v-for="i in 6" :key="i" class="skeleton-line" />
        </div>
        <div v-else class="prompt-editor">
          <textarea
            v-model="draft"
            class="prompt-textarea"
            placeholder="例如：你是一个温柔幽默、喜欢用比喻的中文 AI 助手。 / You are a warm, witty AI assistant who loves using metaphors."
          />
          <div class="prompt-footer">
            <span class="char-count">{{ charCount }} 字符</span>
            <div class="prompt-actions">
              <button
                class="btn-reset"
                :disabled="saving || !data?.is_custom"
                @click="restoreDefault"
              >
                恢复默认
              </button>
              <button
                class="btn-save"
                :disabled="!isDirty || saving"
                @click="save"
              >
                <span v-if="saving">保存中...</span>
                <span v-else-if="savingState === 'saved'">✓ 已保存</span>
                <span v-else-if="savingState === 'error'">保存失败</span>
                <span v-else>保存设定</span>
              </button>
            </div>
          </div>
        </div>

      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.video-playback-panel {
  margin-top: 28px;
  padding: 18px;
  background:
    radial-gradient(circle at 100% 0, rgba(115, 232, 196, 0.09), transparent 42%),
    rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(169, 185, 208, 0.12);
  border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.video-playback-panel .eyebrow {
  margin: 0 0 3px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #718097;
}

.video-playback-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.video-playback-heading h3 {
  margin: 0;
  color: #e7edf6;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.video-playback-caption {
  margin: 5px 0 0;
  color: #6e7b90;
  font-size: 10px;
}

.video-playback-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 9px;
  color: #9aefd8;
  font-size: 9px;
  font-weight: 600;
  background: rgba(115, 232, 196, 0.075);
  border: 1px solid rgba(115, 232, 196, 0.13);
  border-radius: 999px;
}

.video-playback-status i {
  width: 5px;
  height: 5px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(115, 232, 196, 0.1);
}

.video-playback-status.is-muted {
  color: #9aa7b9;
  background: rgba(154, 167, 185, 0.06);
  border-color: rgba(154, 167, 185, 0.11);
}

.video-playback-status.is-muted i {
  background: #7d8a9d;
  box-shadow: none;
}

.video-sound-control {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 10px;
  background: rgba(8, 12, 18, 0.32);
  border: 1px solid rgba(149, 165, 195, 0.08);
  border-radius: 12px;
}

.video-sound-toggle {
  display: inline-flex;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #d8e4ef;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 11px;
  cursor: pointer;
  transition:
    background 150ms ease,
    color 150ms ease,
    border-color 150ms ease,
    transform 150ms ease;
}

.video-sound-toggle:hover {
  color: #07120f;
  background: var(--accent);
  border-color: var(--accent);
}

.video-sound-toggle:active {
  transform: translateY(1px);
}

.video-sound-toggle svg {
  width: 16px;
  height: 16px;
}

.video-sound-control.is-muted .video-sound-toggle {
  color: #7d8a9d;
  background: rgba(255, 255, 255, 0.025);
}

.video-sound-track {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 8px;
}

.video-sound-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.video-sound-meta span {
  color: #94a1b4;
  font-size: 10px;
}

.video-sound-meta strong {
  color: #aab6c7;
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.video-sound-control.is-muted .video-sound-meta strong {
  color: #657185;
}

.video-playback-volume {
  -webkit-appearance: none;
  appearance: none;
  min-width: 0;
  width: 100%;
  height: 18px;
  background: transparent;
  cursor: pointer;
  outline: none;
}

.video-playback-volume:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.video-playback-volume::-webkit-slider-runnable-track {
  width: 100%;
  height: 3px;
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--pct, 0%),
    rgba(137, 153, 176, 0.24) var(--pct, 0%),
    rgba(137, 153, 176, 0.24) 100%
  );
  border-radius: 999px;
}

.video-playback-volume::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid #18231f;
  margin-top: -4.5px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow:
    0 0 0 1px rgba(115, 232, 196, 0.65),
    0 2px 7px rgba(0, 0, 0, 0.42);
}

.video-playback-volume::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow:
    0 0 0 3px rgba(115, 232, 196, 0.14),
    0 2px 8px rgba(0, 0, 0, 0.5);
}

.video-playback-volume::-moz-range-track {
  height: 3px;
  background: rgba(137, 153, 176, 0.24);
  border-radius: 999px;
  border: none;
}

.video-playback-volume::-moz-range-progress {
  height: 3px;
  background: var(--accent);
  border-radius: 999px;
  border: none;
}

.video-playback-volume::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid #18231f;
  box-shadow: 0 0 0 1px rgba(115, 232, 196, 0.65);
  cursor: pointer;
}

@media (max-width: 380px) {
  .video-playback-panel {
    padding: 16px 14px;
  }

  .video-sound-control {
    gap: 9px;
    padding: 8px;
  }

  .video-sound-toggle {
    flex-basis: 34px;
    width: 34px;
    height: 34px;
  }
}
</style>
