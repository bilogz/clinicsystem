<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { BellRingingIcon } from 'vue-tabler-icons';
import { usePmedReportNotifications } from '@/composables/usePmedReportNotifications';
import { formatDateTimeWithTimezone } from '@/utils/dateTime';

const { notifications, loading, notificationCount, refresh, startPolling, stopPolling } = usePmedReportNotifications();

function formatDate(value: string): string {
  return formatDateTimeWithTimezone(value);
}

onMounted(() => {
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="pa-4">
    <div class="d-flex align-center justify-space-between mb-3">
      <h6 class="text-subtitle-1">
        PMED Requests
        <v-chip color="error" variant="flat" size="small" class="ml-2 text-white">{{ notificationCount }}</v-chip>
      </h6>
      <v-btn variant="text" color="primary" size="small" :loading="loading" @click="refresh(true)">Refresh</v-btn>
    </div>
  </div>
  <v-divider />
  <perfect-scrollbar style="height: calc(100vh - 300px); max-height: 650px">
    <v-list class="py-0" lines="three">
      <v-list-item
        v-for="row in notifications"
        :key="`${row.entity_key}-${row.created_at}`"
        color="secondary"
        class="no-spacer"
      >
        <template #prepend>
          <v-avatar size="40" variant="flat" color="lighterror" class="mr-3 py-2 text-error">
            <BellRingingIcon size="20" />
          </v-avatar>
        </template>
        <div class="d-inline-flex align-center justify-space-between w-100">
          <h6 class="text-subtitle-1">{{ row.metadata.report_name || row.action }}</h6>
          <span class="text-subtitle-2 text-medium-emphasis">{{ formatDate(row.created_at) }}</span>
        </div>

        <p class="text-subtitle-2 text-medium-emphasis mt-1">{{ row.detail }}</p>
        <div class="mt-3">
          <v-chip size="small" color="error" variant="tonal" class="mr-2">Unread</v-chip>
          <v-chip size="small" color="primary" variant="tonal">{{ row.actor }}</v-chip>
        </div>
      </v-list-item>
      <v-divider v-for="row in notifications.slice(0, -1)" :key="`divider-${row.entity_key}-${row.created_at}`" />
      <v-list-item v-if="!notifications.length && !loading" color="secondary" class="no-spacer">
        <template #prepend>
          <v-avatar size="40" variant="flat" color="lightsecondary" class="mr-3 py-2 text-secondary">
            <BellRingingIcon size="20" />
          </v-avatar>
        </template>
        <div class="d-inline-flex align-center justify-space-between w-100">
          <h6 class="text-subtitle-1">No PMED requests</h6>
        </div>
        <p class="text-subtitle-2 text-medium-emphasis mt-1">New PMED report requests will appear here automatically.</p>
      </v-list-item>
    </v-list>
  </perfect-scrollbar>
</template>
