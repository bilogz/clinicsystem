<script setup>
import { computed } from 'vue';
import { mdiCircleOutline } from '@mdi/js';
import { useAuthStore } from '@/stores/auth';
import { usePmedReportNotifications } from '@/composables/usePmedReportNotifications';

const props = defineProps({ item: Object, level: Number });
const authStore = useAuthStore();
const { notificationCount } = usePmedReportNotifications();

const reportsNotificationCount = computed(() => {
  if (props.item?.to !== '/modules/reports') return 0;
  return notificationCount.value;
});

function resolveIcon(item) {
  if (typeof item?.icon === 'string' && item.icon.length > 0) return item.icon;
  return mdiCircleOutline;
}

async function handleClick(event) {
  if (props.item?.action !== 'logout') return;
  event.preventDefault();
  await authStore.logout();
}
</script>

<template>
  <!---Single Item-->
  <v-list-item
    :to="item.type === 'external' ? '' : item.to"
    :href="item.type === 'external' ? item.to : ''"
    exact
    rounded
    class="mb-1"
    color="secondary"
    :disabled="item.disabled"
    :target="item.type === 'external' ? '_blank' : ''"
    @click="handleClick"
  >
    <v-list-item-title>
      <div class="sidebar-item-label">
        <v-icon :icon="resolveIcon(item)" size="18" class="sidebar-item-icon" />
        <span>{{ item.title }}</span>
      </div>
    </v-list-item-title>
    <!---If Caption-->
    <v-list-item-subtitle v-if="item.subCaption" class="text-caption mt-n1 hide-menu">
      {{ item.subCaption }}
    </v-list-item-subtitle>
    <!---If any chip or label-->
    <template v-slot:append v-if="item.chip || reportsNotificationCount">
      <div class="d-flex align-center ga-2">
        <v-chip
          v-if="reportsNotificationCount"
          color="error"
          class="hide-menu sidebar-alert-chip"
          size="x-small"
          variant="flat"
        >
          {{ reportsNotificationCount }}
        </v-chip>
        <v-chip
          v-if="item.chip"
          :color="item.chipColor"
          class="sidebarchip hide-menu"
          :size="item.chipIcon ? 'small' : 'default'"
          :variant="item.chipVariant"
          :prepend-icon="item.chipIcon"
        >
          {{ item.chip }}
        </v-chip>
      </div>
    </template>
  </v-list-item>
</template>

<style scoped>
.sidebar-item-label {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebar-item-icon {
  flex: 0 0 auto;
}

.sidebar-alert-chip {
  min-width: 22px;
  justify-content: center;
  font-weight: 700;
}
</style>
