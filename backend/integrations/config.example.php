<?php

return [
    'clinic_system' => [
        'base_url' => 'http://localhost:5173',
        'shared_token' => 'replace-with-a-shared-secret',
        'timeout_seconds' => 20,
    ],
    'cashier_system' => [
        'module_name' => 'cashier',
        'log_file' => __DIR__ . '/logs/cashier-integration.log',
    ],
];
