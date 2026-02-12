<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { Form } from 'vee-validate';

const show1 = ref(false);
const password = ref('Admin#123');
const username = ref('joecelgarcia1@gmail.com');
const passwordRules = ref([(v: string) => !!v || 'Password is required']);
const emailRules = ref([(v: string) => !!v || 'Email is required']);

/* eslint-disable @typescript-eslint/no-explicit-any */
function validate(_values: any, { setErrors }: any) {
  const authStore = useAuthStore();
  return authStore.login(username.value, password.value).catch((error) => setErrors({ apiError: error }));
}
</script>

<template>
  <v-alert color="lightprimary" variant="tonal" class="mb-6">
    Default Admin: <strong>joecelgarcia1@gmail.com</strong><br />
    Password: <strong>Admin#123</strong>
  </v-alert>
  <Form @submit="validate" class="mt-7 loginForm" v-slot="{ errors, isSubmitting }">
    <v-text-field
      v-model="username"
      :rules="emailRules"
      label="Email Address"
      class="mt-2 mb-6"
      required
      density="comfortable"
      hide-details="auto"
      variant="outlined"
      color="primary"
      autocomplete="username"
    ></v-text-field>
    <v-text-field
      v-model="password"
      :rules="passwordRules"
      label="Password"
      required
      density="comfortable"
      variant="outlined"
      color="primary"
      hide-details="auto"
      :append-icon="show1 ? '$eye' : '$eyeOff'"
      :type="show1 ? 'text' : 'password'"
      @click:append="show1 = !show1"
      class="pwdInput"
      autocomplete="current-password"
    ></v-text-field>

    <v-btn color="primary" :loading="isSubmitting" block class="mt-6" variant="flat" size="large" type="submit">
      Sign In</v-btn
    >
    <div v-if="errors.apiError" class="mt-2">
      <v-alert color="error">{{ errors.apiError }}</v-alert>
    </div>
  </Form>
</template>
<style lang="scss">
.outlinedInput .v-field {
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: none;
}
.pwdInput {
  position: relative;
  .v-input__append {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
  }
}
.loginForm {
  .v-text-field .v-field--active input {
    font-weight: 500;
  }
}
</style>
