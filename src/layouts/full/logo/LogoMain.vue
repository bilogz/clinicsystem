<template>
  <div class="logo-main">
    <RouterLink to="/dashboard/default" class="logo-main-link">
      <img :src="nexoraShield" alt="Nexora" class="logo-main-icon" />
      <span class="logo-main-text">Nexora</span>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import nexoraShield from '@/assets/images/logos/nexora-shield.svg';
</script>

<style scoped>
.logo-main-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.logo-main-icon {
  width: 32px;
  height: 32px;
  display: block;
}

.logo-main-text {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  color: rgb(var(--v-theme-primary));
}
</style>
