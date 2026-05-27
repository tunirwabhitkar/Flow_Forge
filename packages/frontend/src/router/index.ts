import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/workflows',
    },
    {
      path: '/auth',
      component: () => import('@/views/AuthLayout.vue'),
      children: [
        {
          path: 'login',
          name: 'login',
          component: () => import('@/views/LoginView.vue'),
          meta: { guest: true },
        },
        {
          path: 'register',
          name: 'register',
          component: () => import('@/views/RegisterView.vue'),
          meta: { guest: true },
        },
      ],
    },
    {
      path: '/',
      component: () => import('@/views/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: 'workflows',
          name: 'workflows',
          component: () => import('@/views/WorkflowsView.vue'),
          meta: { title: 'Workflows' },
        },
        {
          path: 'workflows/:id/edit',
          name: 'workflow-editor',
          component: () => import('@/views/WorkflowEditorView.vue'),
          meta: { title: 'Workflow Editor', fullscreen: true },
        },
        {
          path: 'executions',
          name: 'executions',
          component: () => import('@/views/ExecutionsView.vue'),
          meta: { title: 'Executions' },
        },
        {
          path: 'executions/:id',
          name: 'execution-detail',
          component: () => import('@/views/ExecutionDetailView.vue'),
          meta: { title: 'Execution Detail' },
        },
        {
          path: 'credentials',
          name: 'credentials',
          component: () => import('@/views/CredentialsView.vue'),
          meta: { title: 'Credentials' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: 'Settings' },
          children: [
            {
              path: 'profile',
              name: 'settings-profile',
              component: () => import('@/views/settings/ProfileView.vue'),
            },
            {
              path: 'api-keys',
              name: 'settings-api-keys',
              component: () => import('@/views/settings/ApiKeysView.vue'),
            },
            {
              path: 'users',
              name: 'settings-users',
              component: () => import('@/views/settings/UsersView.vue'),
            },
          ],
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
});

// Navigation guards
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Try to restore session if not loaded
  if (!authStore.initialized) {
    await authStore.initialize();
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta.guest && authStore.isAuthenticated) {
    next({ name: 'workflows' });
    return;
  }

  next();
});
