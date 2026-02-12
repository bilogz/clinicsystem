<template>
  <div class="logo">
    <RouterLink to="/dashboard/default" class="logo-link">
      <img :src="nexoraLogo" alt="Nexora Medical Center" class="logo-image" />
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import nexoraLogo from '@/assets/images/logos/nexora-logo.svg';
</script>

<style scoped>
.logo-link {
  display: inline-flex;
  max-width: 100%;
}

.logo-image {
  width: 168px;
  max-width: 100%;
  height: auto;
  display: block;
}
</style>
