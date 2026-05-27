<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import type { PictureBookPage } from "@career/contracts/types";

const props = defineProps<{
  pages: PictureBookPage[];
  title: string;
  resolveUrl: (path: string) => string;
}>();

const currentIndex = ref(0);
const isPlaying = ref(false);
const audioRef = ref<HTMLAudioElement | null>(null);

const currentPage = computed(() => props.pages[currentIndex.value] ?? null);
const isLastPage = computed(() => currentIndex.value >= props.pages.length - 1);
const isFirstPage = computed(() => currentIndex.value === 0);
const progressPercent = computed(() =>
  props.pages.length > 0 ? ((currentIndex.value + 1) / props.pages.length) * 100 : 0,
);

watch(currentIndex, () => {
  stopAudio();
  nextTick(() => playAudio());
});

function ensureAudioSource(): void {
  if (!audioRef.value || !currentPage.value) return;
  const nextSrc = props.resolveUrl(currentPage.value.audio_url);
  if (audioRef.value.src !== nextSrc) {
    audioRef.value.src = nextSrc;
  }
}

function playAudio(): void {
  if (!audioRef.value || !currentPage.value) return;
  ensureAudioSource();
  audioRef.value
    .play()
    .then(() => {
      isPlaying.value = true;
    })
    .catch(() => {
      isPlaying.value = false;
    });
}

function stopAudio(): void {
  if (audioRef.value) {
    audioRef.value.pause();
    audioRef.value.currentTime = 0;
  }
  isPlaying.value = false;
}

function togglePlay(): void {
  if (!audioRef.value) return;
  if (isPlaying.value) {
    audioRef.value.pause();
    isPlaying.value = false;
    return;
  }
  playAudio();
}

function onAudioEnded(): void {
  isPlaying.value = false;
  if (!isLastPage.value) {
    setTimeout(() => {
      currentIndex.value++;
    }, 600);
  }
}

function nextPage(): void {
  if (isLastPage.value) return;
  stopAudio();
  currentIndex.value++;
}

function prevPage(): void {
  if (isFirstPage.value) return;
  stopAudio();
  currentIndex.value--;
}
</script>

<template>
  <section class="picture-book-viewer" :aria-label="title">
    <audio ref="audioRef" @ended="onAudioEnded" preload="metadata" />

    <header class="viewer-topbar">
      <div>
        <span class="viewer-kicker">有声绘本</span>
        <h4>{{ title }}</h4>
      </div>
      <div class="viewer-count" aria-live="polite">
        <strong>{{ currentIndex + 1 }}</strong>
        <span>/ {{ pages.length }}</span>
      </div>
    </header>

    <div class="viewer-shell">
      <figure class="image-panel">
        <transition name="page-fade" mode="out-in">
          <img
            v-if="currentPage"
            :key="currentPage.page_index"
            :src="resolveUrl(currentPage.image_url)"
            :alt="`${title}第 ${currentIndex + 1} 页插图`"
            class="picture-book-image"
          />
        </transition>
      </figure>

      <aside class="narration-panel">
        <span class="page-label">第 {{ currentIndex + 1 }} 页</span>
        <transition name="text-slide" mode="out-in">
          <p v-if="currentPage" :key="currentPage.page_index" class="narration">
            {{ currentPage.narration_text }}
          </p>
        </transition>
      </aside>
    </div>

    <footer class="viewer-controls">
      <div
        class="progress-track"
        role="progressbar"
        :aria-valuenow="currentIndex + 1"
        aria-valuemin="1"
        :aria-valuemax="pages.length"
      >
        <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>

      <div class="control-row">
        <button
          type="button"
          class="nav-button"
          :disabled="isFirstPage"
          aria-label="上一页"
          @click="prevPage"
        >
          <span class="chevron chevron-left"></span>
          上一页
        </button>

        <button
          type="button"
          :class="['play-button', { playing: isPlaying }]"
          :aria-label="isPlaying ? '暂停播放' : '播放当前页旁白'"
          @click="togglePlay"
        >
          <span class="play-symbol" aria-hidden="true"></span>
          {{ isPlaying ? "暂停" : "播放" }}
        </button>

        <button
          type="button"
          class="nav-button"
          :disabled="isLastPage"
          aria-label="下一页"
          @click="nextPage"
        >
          下一页
          <span class="chevron chevron-right"></span>
        </button>
      </div>

      <div class="page-dots" aria-label="绘本页码">
        <button
          v-for="(_, i) in pages"
          :key="i"
          type="button"
          :class="['dot', { active: i === currentIndex }]"
          :aria-label="`跳转到第 ${i + 1} 页`"
          :aria-current="i === currentIndex ? 'step' : undefined"
          @click="currentIndex = i"
        />
      </div>
    </footer>
  </section>
</template>

<style scoped>
.picture-book-viewer {
  --reader-bg: #ffffff;
  --reader-panel: #ffffff;
  --reader-panel-soft: #f8fafc;
  --reader-primary: #2563eb;
  --reader-primary-hover: #1d4ed8;
  --reader-text: #0f172a;
  --reader-muted: #64748b;
  --reader-border: #e2e8f0;

  display: grid;
  gap: 18px;
  width: 100%;
  padding: 18px;
  border-radius: 8px;
  border: 1px solid var(--reader-border);
  background: var(--reader-bg);
  color: var(--reader-text);
}

.viewer-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.viewer-kicker {
  display: inline-flex;
  margin-bottom: 4px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.viewer-topbar h4 {
  margin: 0;
  color: var(--reader-text);
  font-size: 18px;
  line-height: 1.4;
}

.viewer-count {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 76px;
  justify-content: flex-end;
  color: var(--reader-muted);
  font-variant-numeric: tabular-nums;
}

.viewer-count strong {
  color: #2563eb;
  font-size: 28px;
  line-height: 1;
}

.viewer-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
  gap: 16px;
  min-height: 500px;
}

.image-panel,
.narration-panel {
  min-width: 0;
  border: 1px solid var(--reader-border);
  border-radius: 8px;
  background: var(--reader-panel);
  box-shadow: 0 16px 34px rgb(15 23 42 / 6%);
}

.image-panel {
  display: grid;
  place-items: center;
  margin: 0;
  overflow: hidden;
}

.picture-book-image {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 560px;
  object-fit: contain;
  background: #ffffff;
}

.narration-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
  padding: 28px;
  background: linear-gradient(180deg, var(--reader-panel), var(--reader-panel-soft));
}

.page-label {
  width: fit-content;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  padding: 5px 12px;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.narration {
  margin: 0;
  color: #1e293b;
  font-size: 18px;
  line-height: 1.75;
}

.viewer-controls {
  display: grid;
  gap: 14px;
}

.progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: #60a5fa;
  transition: width 220ms ease;
}

.control-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.nav-button,
.play-button,
.dot {
  cursor: pointer;
}

.nav-button,
.play-button {
  min-height: 44px;
  border-radius: 8px;
  font-weight: 700;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    transform 180ms ease;
}

.nav-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--reader-border);
  background: #ffffff;
  color: var(--reader-text);
  padding: 0 18px;
}

.nav-button:not(:disabled):hover {
  border-color: #bfdbfe;
  background: #eff6ff;
  transform: translateY(-1px);
}

.nav-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.play-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 132px;
  border: 1px solid var(--reader-primary);
  background: var(--reader-primary);
  color: #ffffff;
  padding: 0 22px;
}

.play-button:hover {
  background: var(--reader-primary-hover);
  border-color: var(--reader-primary-hover);
  transform: translateY(-1px);
}

.play-symbol {
  width: 0;
  height: 0;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 11px solid currentColor;
}

.play-button.playing .play-symbol {
  width: 12px;
  height: 14px;
  border-top: 0;
  border-bottom: 0;
  border-left: 4px solid currentColor;
  border-right: 4px solid currentColor;
}

.chevron {
  width: 9px;
  height: 9px;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
}

.chevron-left {
  transform: rotate(-135deg);
}

.chevron-right {
  transform: rotate(45deg);
}

.page-dots {
  display: flex;
  justify-content: center;
  gap: 2px;
}

.dot {
  position: relative;
  width: 44px;
  min-height: 44px;
  border: 0;
  background: transparent;
  padding: 0;
}

.dot::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 28px;
  height: 10px;
  border-radius: 999px;
  background: #cbd5e1;
  content: "";
  transform: translate(-50%, -50%);
}

.dot.active::after {
  background: #60a5fa;
}

.page-fade-enter-active,
.page-fade-leave-active,
.text-slide-enter-active,
.text-slide-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
  transform: scale(0.985);
}

.text-slide-enter-from,
.text-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 980px) {
  .viewer-shell {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .image-panel {
    min-height: 360px;
  }

  .narration-panel {
    padding: 22px;
  }

  .control-row {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .progress-fill,
  .nav-button,
  .play-button,
  .page-fade-enter-active,
  .page-fade-leave-active,
  .text-slide-enter-active,
  .text-slide-leave-active {
    transition: none;
  }
}
</style>
