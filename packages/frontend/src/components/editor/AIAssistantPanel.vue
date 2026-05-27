<template>
  <div class="ai-panel">
    <div class="ai-panel-header">
      <div class="ai-header-left">
        <div class="ai-icon">
          <el-icon color="white" :size="16"><MagicStick /></el-icon>
        </div>
        <div>
          <h3>AI Assistant</h3>
          <span class="ai-subtitle">Powered by Claude</span>
        </div>
      </div>
      <el-button text :icon="Close" @click="$emit('close')" />
    </div>

    <div class="ai-tabs">
      <button
        class="ai-tab"
        :class="{ active: mode === 'generate' }"
        @click="mode = 'generate'"
      >
        Generate Nodes
      </button>
      <button
        class="ai-tab"
        :class="{ active: mode === 'chat' }"
        @click="mode = 'chat'"
      >
        Chat
      </button>
    </div>

    <!-- Generate mode -->
    <div v-if="mode === 'generate'" class="ai-body">
      <div class="generate-form">
        <el-input
          v-model="generatePrompt"
          type="textarea"
          :rows="3"
          placeholder="Describe what you want this workflow to do…&#10;e.g. 'When a webhook is received, send a Slack message and save to Postgres'"
          resize="none"
        />
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!generatePrompt.trim()"
          style="width: 100%"
          @click="handleGenerate"
        >
          <el-icon v-if="!generating"><MagicStick /></el-icon>
          Generate Workflow
        </el-button>
      </div>

      <div v-if="generatedResult" class="generate-result">
        <div class="result-header">
          <el-icon color="#31C48D"><Check /></el-icon>
          <span>Generated {{ generatedResult.nodes.length }} nodes</span>
        </div>
        <div class="result-explanation">{{ generatedResult.explanation }}</div>
        <div class="result-nodes">
          <div v-for="node in generatedResult.nodes" :key="node.name" class="result-node">
            <span class="result-node-type">{{ node.type }}</span>
            <span class="result-node-name">{{ node.name }}</span>
          </div>
        </div>
        <el-button
          type="success"
          size="small"
          style="width: 100%; margin-top: 10px"
          @click="insertNodes"
        >
          Insert into Workflow
        </el-button>
      </div>
    </div>

    <!-- Chat mode -->
    <div v-else class="ai-body chat-mode">
      <div class="chat-messages" ref="chatScrollRef">
        <div
          v-for="(msg, idx) in chatMessages"
          :key="idx"
          class="chat-message"
          :class="msg.role"
        >
          <div class="message-bubble">
            <span v-if="msg.role === 'assistant'" class="msg-icon">✦</span>
            <span class="message-text">{{ msg.content }}</span>
          </div>
        </div>
        <div v-if="chatLoading" class="chat-message assistant">
          <div class="message-bubble">
            <span class="msg-icon">✦</span>
            <div class="typing-indicator">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </div>

      <div class="chat-input-wrap">
        <el-input
          v-model="chatInput"
          type="textarea"
          :rows="2"
          placeholder="Ask about workflows, nodes, best practices…"
          resize="none"
          @keydown.enter.exact.prevent="sendChat"
        />
        <el-button
          type="primary"
          :icon="Promotion"
          circle
          :loading="chatLoading"
          @click="sendChat"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { MagicStick, Close, Check, Promotion } from '@element-plus/icons-vue';
import { aiApi } from '@/api/index.js';
import { ElMessage } from 'element-plus';

const emit = defineEmits<{
  close: [];
  'insert-nodes': [payload: { nodes: unknown[]; connections: unknown }];
}>();

const mode = ref<'generate' | 'chat'>('generate');
const generatePrompt = ref('');
const generating = ref(false);
const generatedResult = ref<any>(null);

const chatMessages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([
  { role: 'assistant', content: 'Hi! I can help you build workflows, explain nodes, and suggest best practices. What would you like to know?' },
]);
const chatInput = ref('');
const chatLoading = ref(false);
const chatScrollRef = ref<HTMLElement>();

async function handleGenerate(): Promise<void> {
  if (!generatePrompt.value.trim()) return;
  generating.value = true;
  generatedResult.value = null;
  try {
    const res = await aiApi.generateNodes({ description: generatePrompt.value });
    generatedResult.value = (res.data as any);
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error ?? 'AI generation failed');
  } finally {
    generating.value = false;
  }
}

function insertNodes(): void {
  if (!generatedResult.value) return;
  emit('insert-nodes', { nodes: generatedResult.value.nodes, connections: generatedResult.value.connections });
  ElMessage.success('Nodes inserted!');
}

async function sendChat(): Promise<void> {
  const content = chatInput.value.trim();
  if (!content || chatLoading.value) return;
  chatMessages.value.push({ role: 'user', content });
  chatInput.value = '';
  chatLoading.value = true;

  try {
    const res = await aiApi.chat(chatMessages.value.filter((m) => m.role !== 'system'));
    const reply = (res.data as any).reply as string;
    chatMessages.value.push({ role: 'assistant', content: reply });
    await nextTick();
    chatScrollRef.value?.scrollTo({ top: chatScrollRef.value.scrollHeight, behavior: 'smooth' });
  } catch {
    ElMessage.error('Chat failed. Please try again.');
  } finally {
    chatLoading.value = false;
  }
}
</script>

<style scoped>
.ai-panel {
  position: absolute;
  right: 16px;
  top: 16px;
  bottom: 16px;
  width: 360px;
  background: white;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  display: flex;
  flex-direction: column;
  z-index: 200;
  overflow: hidden;
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ai-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #8B5CF6, #6E56CF);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-panel-header h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.ai-subtitle {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.ai-tabs {
  display: flex;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 0 4px;
}

.ai-tab {
  flex: 1;
  padding: 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.ai-tab.active {
  color: #8B5CF6;
  border-bottom-color: #8B5CF6;
}

.ai-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-mode {
  padding: 0;
}

.generate-result {
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 12px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-success);
  margin-bottom: 8px;
}

.result-explanation {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  line-height: 1.5;
}

.result-nodes {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-node {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.result-node-type {
  font-family: monospace;
  color: #8B5CF6;
  font-size: 11px;
}

.result-node-name {
  color: var(--el-text-color-regular);
}

/* Chat styles */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-message { display: flex; }

.chat-message.user { justify-content: flex-end; }

.message-bubble {
  max-width: 90%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.chat-message.user .message-bubble {
  background: #8B5CF6;
  color: white;
  border-radius: 12px 12px 2px 12px;
}

.chat-message.assistant .message-bubble {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-primary);
  border-radius: 12px 12px 12px 2px;
}

.msg-icon {
  color: #8B5CF6;
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.message-text { white-space: pre-wrap; }

.typing-indicator {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 4px 0;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  background: #8B5CF6;
  border-radius: 50%;
  animation: bounce 1.2s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}

.chat-input-wrap {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  align-items: flex-end;
}

.chat-input-wrap .el-textarea { flex: 1; }
</style>
