<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = defineProps<{
  busy: boolean
  showSources: boolean
}>()

const emit = defineEmits<{
  send: [message: string, enableWebSearch: boolean]
  'update:showSources': [value: boolean]
  stop: []
}>()

const input = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const WEB_SEARCH_KEY = 'nebula-web-search-enabled-v2'
const storedWebSearch = localStorage.getItem(WEB_SEARCH_KEY)
const webSearch = ref(
  storedWebSearch === null ? true : storedWebSearch === '1',
)
if (storedWebSearch === null) {
  localStorage.setItem(WEB_SEARCH_KEY, '1')
}

function toggleWebSearch(): void {
  webSearch.value = !webSearch.value
  localStorage.setItem(WEB_SEARCH_KEY, webSearch.value ? '1' : '0')
}

function resize(): void {
  if (!textarea.value) return
  textarea.value.style.height = 'auto'
  textarea.value.style.height = `${Math.min(textarea.value.scrollHeight, 168)}px`
}

function submit(): void {
  if (props.busy || !input.value.trim()) return
  emit('send', input.value.trim(), webSearch.value)
  input.value = ''
  nextTick(resize)
}

function keydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <div class="composer-wrap">
    <div class="composer" :class="{ 'composer--busy': busy }">
      <textarea
        ref="textarea"
        v-model="input"
        rows="1"
        :disabled="busy"
        placeholder="输入消息，Enter 发送，Shift + Enter 换行"
        aria-label="聊天消息"
        @input="resize"
        @keydown="keydown"
      />
      <div class="composer-actions">
        <button
          type="button"
          class="web-toggle"
          :class="{ 'web-toggle--on': webSearch }"
          :disabled="busy"
          aria-label="联网搜索"
          :aria-pressed="webSearch"
          :title="webSearch ? '已开启联网搜索' : '开启联网搜索'"
          @click="toggleWebSearch"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" class="globe-icon">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a14 14 0 0 1 0 18" />
            <path d="M12 3a14 14 0 0 0 0 18" />
          </svg>
          <span>联网</span>
        </button>
        <button
          type="button"
          class="web-toggle"
          :class="{ 'web-toggle--on': props.showSources }"
          :disabled="busy"
          aria-label="显示来源"
          :aria-pressed="props.showSources"
          :title="props.showSources ? '已开启显示来源' : '开启显示来源'"
          @click="emit('update:showSources', !props.showSources)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" class="globe-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 13h6M9 17h4" />
          </svg>
          <span>来源</span>
        </button>
        <span class="model-label"><i /> DeepSeek · LangGraph</span>
        <button v-if="busy" class="stop-button" aria-label="停止生成" @click="emit('stop')">
          <span />
        </button>
        <button
          v-else
          class="send-button"
          :disabled="!input.trim()"
          aria-label="发送消息"
          @click="submit"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14-7-4 14-3-6zM12 13l7-8" /></svg>
        </button>
      </div>
    </div>
    <p class="composer-note">AI 可能会犯错，请核对重要信息。对话与消息仅保存在你的数据库中。</p>
  </div>
</template>
