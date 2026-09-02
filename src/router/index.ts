import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  // CF-Server-Monitor 主题路由约定：首页 /#/，详情 /#/server/:id，管理后台 /admin#admin
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/server/:id',
      name: 'server-detail',
      component: () => import('@/views/InstanceDetail.vue'),
    },
  ],
})

export default router