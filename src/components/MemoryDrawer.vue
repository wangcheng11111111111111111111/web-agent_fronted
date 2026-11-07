<script setup lang="ts">
import { ref, watch } from 'vue'
import type { StoredMemoryFact } from '../types'
import { deleteMemory, listMemories } from '../services/api'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  close: []
  error: [message: string]
  toast: [message: string]
}>()

const memories = ref<StoredMemoryFact[]>([])
const loading = ref(false)
const typeNames: Record<string, string> = {
  profile: '个人资料',
  preference: '偏好',
  goal: '目标',
  constraint: '限制条件',
  project: '项目',
  habit: '习惯',
  skill: '技能',
  relationship: '关系',
  context: '近期情境',
}

function formatExpiry(value?: string | null): string {
  if (!value) return '长期'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '长期'
  return `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)} 到期`
}

async function load(): Promise<void> {
  loading.value = true
  try {
    memories.value = await listMemories()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '读取长期记忆失败')
  } finally {
    loading.value = false
  }
}

async function remove(id: string): Promise<void> {
  if (!window.confirm('确认删除这条长期记忆？')) return
  try {
    await deleteMemory(id)
    memories.value = memories.value.filter((item) => item.id !== id)
    emit('toast', '长期记忆已删除')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '删除长期记忆失败')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void load()
  },
)
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="drawer-shell">
      <div class="drawer-scrim" @click="emit('close')" />
      <aside class="knowledge-drawer memory-drawer">
        <header>
          <div>
            <p class="eyebrow">CROSS-SESSION MEMORY</p>
            <h2>长期记忆</h2>
          </div>
          <button class="icon-button" aria-label="关闭长期记忆" @click="emit('close')">×</button>
        </header>

        <section class="memory-explainer">
          <strong>{{ memories.length }} 条稳定事实</strong>
          <p>
            最近对话由 Redis 热缓存加速；这里保存从你明确陈述中提取的偏好、目标和项目事实。
            敏感信息不会写入，删除后不会参与后续对话。
          </p>
        </section>

        <div v-if="loading" class="document-skeletons">
          <span v-for="i in 4" :key="i" />
        </div>
        <div v-else-if="memories.length" class="memory-list">
          <article v-for="memory in memories" :key="memory.id">
            <div class="memory-card-head">
              <span>{{ typeNames[memory.fact_type] || memory.fact_type }}</span>
              <small>{{ Math.round(memory.confidence * 100) }}% · {{ formatExpiry(memory.expires_at) }}</small>
              <button aria-label="删除记忆" @click="remove(memory.id)">×</button>
            </div>
            <strong>{{ memory.memory_key || memory.subject }}</strong>
            <p>{{ memory.content }}</p>
            <div class="memory-card-meta">
              <span>{{ memory.subject }}</span>
              <span>访问 {{ memory.access_count || 0 }} 次</span>
            </div>
          </article>
        </div>
        <div v-else class="document-empty memory-empty">
          <span>◌</span>
          <p>还没有长期记忆。明确告诉我你的偏好或长期目标，后续对话会自动关联。</p>
        </div>
      </aside>
    </div>
  </Transition>
</template>
