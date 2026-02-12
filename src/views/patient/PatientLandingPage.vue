<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import nexoraLogo from '@/assets/images/logos/nexora-logo.svg';

const currentStep = ref(1);

function nextStep() {
  currentStep.value = Math.min(3, currentStep.value + 1);
}
</script>

<template>
  <div class="patient-page">
    <div class="patient-topbar">
      <div class="patient-topbar-inner">
        <span><v-icon icon="mdi-phone" size="14" class="mr-1" /> Call : +01 1234567890</span>
        <span><v-icon icon="mdi-email" size="14" class="mr-1" /> demo@gmail.com</span>
        <span><v-icon icon="mdi-map-marker" size="14" class="mr-1" /> Location</span>
      </div>
    </div>

    <section class="patient-hero">
      <div class="patient-hero-overlay"></div>
      <div class="patient-hero-content">
        <img :src="nexoraLogo" alt="Nexora Medical Center" class="patient-logo" />

        <nav class="patient-nav">
          <RouterLink to="/">Home</RouterLink>
          <a href="#">About</a>
          <a href="#">Treatment</a>
          <a href="#">Doctors</a>
          <a href="#">Contact Us</a>
          <RouterLink to="/admin/login">Login</RouterLink>
          <RouterLink to="/admin/register">Sign Up</RouterLink>
        </nav>

        <h1>WE CARE FOR YOU</h1>
        <p>Book ahead and confirm your details to skip the physical queue.</p>
        <button type="button" class="book-now-btn">BOOK NOW</button>
      </div>
    </section>

    <section class="patient-booking-wrap">
      <div class="patient-booking-card">
        <h2>BOOK <span>APPOINTMENT</span></h2>
        <p class="booking-subtitle">Confirm your booking details here to avoid waiting in the physical queue.</p>

        <div class="stepper">
          <div class="step" :class="{ active: currentStep === 1 }">
            <span>1</span>
            <label>Patient</label>
          </div>
          <div class="step-line"></div>
          <div class="step" :class="{ active: currentStep === 2 }">
            <span>2</span>
            <label>Schedule</label>
          </div>
          <div class="step-line"></div>
          <div class="step" :class="{ active: currentStep === 3 }">
            <span>3</span>
            <label>Review</label>
          </div>
        </div>

        <div class="form-title">PATIENT INFORMATION</div>
        <div class="form-grid">
          <div class="field">
            <label>Patient Name</label>
            <input type="text" placeholder="Full name" />
          </div>
          <div class="field">
            <label>Email Address</label>
            <input type="email" placeholder="name@example.com" />
          </div>
          <div class="field">
            <label>Phone Number</label>
            <input type="text" placeholder="e.g., 09xx xxx xxxx" />
          </div>
          <div class="field">
            <label>Age</label>
            <input type="number" placeholder="Age" />
          </div>
          <div class="field">
            <label>Gender</label>
            <select>
              <option>Select gender</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </div>
          <div class="field minor-check">
            <label>Minor Check</label>
            <div class="minor-check-text">Enter age to validate guardian requirements.</div>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="next-btn" @click="nextStep">Next: Schedule</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.patient-page {
  --nexora-navy: #072d8a;
  --nexora-primary-dark: #0f66e8;
  --nexora-primary: #1bbaff;
  --nexora-ink: #2f5f86;
  --nexora-bg: #eef2f4;
  min-height: 100vh;
  background: var(--nexora-bg);
}

.patient-topbar {
  background: linear-gradient(90deg, var(--nexora-primary-dark) 0%, var(--nexora-primary) 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.patient-topbar-inner {
  width: min(1200px, 94vw);
  margin: 0 auto;
  padding: 10px 0;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.patient-hero {
  position: relative;
  min-height: 520px;
  background: linear-gradient(130deg, #1b4f7d 0%, #1d5266 62%, #27495a 100%);
  overflow: hidden;
}

.patient-hero::after {
  content: '';
  position: absolute;
  right: -180px;
  top: -40px;
  width: 780px;
  height: 640px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  transform: rotate(-25deg);
  opacity: 0.35;
}

.patient-hero-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 10%, rgba(27, 186, 255, 0.16), transparent 48%);
}

.patient-hero-content {
  position: relative;
  z-index: 2;
  width: min(1200px, 94vw);
  margin: 0 auto;
  padding: 38px 0 210px;
  text-align: center;
  color: #fff;
}

.patient-logo {
  width: 210px;
  max-width: 90%;
}

.patient-nav {
  margin: 28px auto 78px;
  display: flex;
  gap: 22px;
  justify-content: center;
  flex-wrap: wrap;
}

.patient-nav a {
  color: #fff;
  text-decoration: none;
  font-size: 21px;
  font-weight: 500;
  text-transform: uppercase;
}

.patient-nav a:hover {
  color: var(--nexora-primary);
}

.patient-hero h1 {
  margin: 0;
  font-size: clamp(32px, 4.5vw, 56px);
  font-weight: 800;
}

.patient-hero p {
  margin: 14px auto 24px;
  font-size: 22px;
  max-width: 860px;
}

.book-now-btn {
  border: 0;
  border-radius: 6px;
  padding: 13px 34px;
  background: var(--nexora-primary);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

.book-now-btn:hover {
  background: #11a3eb;
}

.patient-booking-wrap {
  width: min(1200px, 94vw);
  margin: -160px auto 56px;
  position: relative;
  z-index: 3;
}

.patient-booking-card {
  background: #fff;
  border: 1px solid #d4dde2;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.12);
  padding: 34px;
}

.patient-booking-card h2 {
  margin: 0;
  font-size: clamp(28px, 3.5vw, 50px);
  font-weight: 800;
  color: #1e2329;
}

.patient-booking-card h2 span {
  color: var(--nexora-primary);
}

.booking-subtitle {
  margin: 8px 0 20px;
  color: #5f7583;
  font-size: 22px;
}

.stepper {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 92px;
}

.step span {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid #bcd6e3;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #527487;
  font-size: 14px;
  font-weight: 700;
  background: #fff;
}

.step.active span {
  background: var(--nexora-primary);
  border-color: var(--nexora-primary);
  color: #fff;
}

.step label {
  margin-top: 6px;
  font-size: 14px;
  color: #496673;
  font-weight: 700;
}

.step-line {
  flex: 1;
  height: 1px;
  background: #b9d6e2;
  margin: 0 16px;
}

.form-title {
  font-size: 13px;
  letter-spacing: 0.8px;
  font-weight: 800;
  color: #4b6b7c;
  margin-bottom: 10px;
}

.form-grid {
  display: grid;
  gap: 14px 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.field label {
  display: block;
  margin-bottom: 7px;
  color: #5c7482;
  font-size: 14px;
  font-weight: 700;
}

.field input,
.field select {
  width: 100%;
  height: 46px;
  border-radius: 8px;
  border: 1px solid #cbd8df;
  padding: 10px 12px;
  font-size: 15px;
  color: #2f5f86;
  background: #fff;
}

.field input:focus,
.field select:focus {
  outline: none;
  border-color: var(--nexora-primary);
  box-shadow: 0 0 0 3px rgba(27, 186, 255, 0.14);
}

.minor-check {
  border: 1px solid #cfe6ee;
  background: #f1f9fc;
  border-radius: 8px;
  padding: 10px 12px;
}

.minor-check label {
  margin-bottom: 3px;
}

.minor-check-text {
  color: #557685;
  font-size: 13px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.next-btn {
  border: 0;
  border-radius: 999px;
  padding: 12px 26px;
  background: var(--nexora-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.next-btn:hover {
  background: var(--nexora-primary-dark);
}

@media (max-width: 991px) {
  .patient-nav {
    margin-bottom: 42px;
  }

  .patient-hero p {
    font-size: 18px;
  }

  .booking-subtitle {
    font-size: 18px;
  }

  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .patient-hero-content {
    padding-bottom: 160px;
  }

  .patient-nav {
    gap: 10px 14px;
  }

  .patient-nav a {
    font-size: 14px;
  }

  .stepper {
    gap: 10px;
  }

  .step-line {
    display: none;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .patient-booking-card {
    padding: 20px;
  }
}
</style>
