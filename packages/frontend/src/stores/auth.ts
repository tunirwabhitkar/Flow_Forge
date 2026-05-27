import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, type User } from '@/api/index.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('ff_token'));
  const initialized = ref(false);

  const isAuthenticated = computed(() => !!user.value);
  const isOwner = computed(() => user.value?.role === 'owner');
  const isAdmin = computed(() => ['owner', 'admin'].includes(user.value?.role ?? ''));

  async function initialize(): Promise<void> {
    if (token.value) {
      try {
        const res = await authApi.me();
        user.value = res.data.user;
      } catch {
        token.value = null;
        user.value = null;
        localStorage.removeItem('ff_token');
      }
    }
    initialized.value = true;
  }

  async function login(email: string, password: string, totpCode?: string): Promise<void> {
    const res = await authApi.login({ email, password, totpCode });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('ff_token', res.data.token);
  }

  async function register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<void> {
    const res = await authApi.register({ email, password, firstName, lastName });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('ff_token', res.data.token);
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch { /* ignore */ }
    token.value = null;
    user.value = null;
    localStorage.removeItem('ff_token');
  }

  return {
    user,
    token,
    initialized,
    isAuthenticated,
    isOwner,
    isAdmin,
    initialize,
    login,
    register,
    logout,
  };
});
