export const REALTIME_POLICY = {
  polling: {
    registrationMs:     20000,
    walkInMs:           20000,
    checkupMs:          15000,
    laboratoryMs:       20000,
    cashierMs:          20000,
    pharmacyMs:         30000,
    patientsMs:         20000,
    reportsMs:          30000,
    prefectIncidentsMs: 20000,
    // PMED notification badge — longer interval keeps the header lightweight;
    // a visibility-change trigger fires an immediate refresh on tab focus anyway.
    pmedNotificationsMs: 60000
  },
  debounce: {
    registrationSearchMs: 300,
    checkupSearchMs:      280,
    patientsSearchMs:     280
  },
  uiTick: {
    walkInClockMs: 30000
  }
} as const;
