<template>
  <el-config-provider :locale="locale">
    <RouterView />
  </el-config-provider>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import en from 'element-plus/es/locale/lang/en';

const locale = en;
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#app {
  height: 100%;
  width: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}
</style>
