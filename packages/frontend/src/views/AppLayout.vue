<template>
  <div class="app-shell">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-logo">
        <div class="logo-mark">
          <el-icon size="24"><Connection /></el-icon>
        </div>
        <span v-if="!sidebarCollapsed" class="logo-text">FlowForge</span>
      </div>

      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item.to) }"
          :title="sidebarCollapsed ? item.label : ''"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span v-if="!sidebarCollapsed" class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <button class="nav-item collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          <el-icon :size="18">
            <Fold v-if="!sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <span v-if="!sidebarCollapsed">Collapse</span>
        </button>

        <el-dropdown trigger="click" placement="top-start">
          <div class="user-avatar">
            <el-avatar :size="32" :style="{ background: avatarColor }">
              {{ userInitials }}
            </el-avatar>
            <span v-if="!sidebarCollapsed" class="user-name">{{ authStore.user?.firstName }}</span>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="$router.push('/settings/profile')">
                <el-icon><User /></el-icon> Profile
              </el-dropdown-item>
              <el-dropdown-item @click="$router.push('/settings/api-keys')">
                <el-icon><Key /></el-icon> API Keys
              </el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">
                <el-icon><SwitchButton /></el-icon> Logout
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import {
  Connection, Workflow, List, Lock, Setting,
  Fold, Expand, User, Key, SwitchButton,
} from '@element-plus/icons-vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const sidebarCollapsed = ref(false);

const navItems = [
  { name: 'workflows', label: 'Workflows', icon: 'Workflow', to: '/workflows' },
  { name: 'executions', label: 'Executions', icon: 'List', to: '/executions' },
  { name: 'credentials', label: 'Credentials', icon: 'Lock', to: '/credentials' },
  { name: 'settings', label: 'Settings', icon: 'Setting', to: '/settings/profile' },
];

const userInitials = computed(() => {
  const u = authStore.user;
  if (!u) return '?';
  return `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase();
});

const avatarColor = computed(() => {
  const colors = ['#6E56CF', '#2196F3', '#31C48D', '#F59E0B', '#EF4444'];
  const idx = (authStore.user?.email.length ?? 0) % colors.length;
  return colors[idx];
});

function isActive(to: string): boolean {
  return route.path.startsWith(to);
}

async function handleLogout(): Promise<void> {
  await authStore.logout();
  router.push('/auth/login');
}
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.sidebar {
  width: 220px;
  min-width: 220px;
  background: #1a1a2e;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, min-width 0.2s ease;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.sidebar.collapsed {
  width: 60px;
  min-width: 60px;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.logo-mark {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #6E56CF, #2196F3);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: white;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  letter-spacing: -0.3px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 8px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
}

.nav-item.active {
  background: rgba(110, 86, 207, 0.25);
  color: #a78bfa;
}

.nav-label {
  font-size: 14px;
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.collapse-btn {
  color: #64748b;
}

.collapse-btn:hover {
  color: #94a3b8;
}

.user-avatar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.user-avatar:hover {
  background: rgba(255, 255, 255, 0.08);
}

.user-name {
  font-size: 14px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.main-content {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
</style>
