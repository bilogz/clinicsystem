<?php

declare(strict_types=1);

function integration_root_path(string $suffix = ''): string
{
    $root = __DIR__;
    return $suffix === '' ? $root : $root . DIRECTORY_SEPARATOR . ltrim($suffix, DIRECTORY_SEPARATOR);
}

function load_integration_config(): array
{
    $configPath = integration_root_path('config.php');
    $examplePath = integration_root_path('config.example.php');

    if (file_exists($configPath)) {
        $config = require $configPath;
    } else {
        $config = require $examplePath;
    }

    return is_array($config) ? $config : [];
}

function read_json_request_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function json_response(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function require_shared_token(string $expectedToken): void
{
    $providedToken = $_SERVER['HTTP_X_SHARED_TOKEN'] ?? '';
    if ($expectedToken === '' || !hash_equals($expectedToken, (string) $providedToken)) {
        json_response([
            'ok' => false,
            'message' => 'Unauthorized integration request.',
        ], 401);
    }
}

function append_integration_log(string $filePath, string $message, array $context = []): void
{
    $directory = dirname($filePath);
    if (!is_dir($directory)) {
        mkdir($directory, 0777, true);
    }

    $line = sprintf(
        "[%s] %s %s%s",
        date('Y-m-d H:i:s'),
        $message,
        $context !== [] ? json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '',
        PHP_EOL
    );

    file_put_contents($filePath, $line, FILE_APPEND);
}
