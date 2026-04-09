<?php
header('Content-Type: application/json');

$dbHost = getenv('DB_HOST') ?: 'timescaledb';
$dbPort = getenv('DB_PORT') ?: '5432';
$dbName = getenv('DB_NAME') ?: 'appdb';
$dbUser = getenv('DB_USER') ?: 'appuser';
$dbPass = getenv('DB_PASSWORD') ?: 'changeme';

try {
    $pdo = new PDO("pgsql:host=$dbHost;port=$dbPort;dbname=$dbName", $dbUser, $dbPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// AGENT: Customize notification channels and templates for industry
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            recipient TEXT NOT NULL,
            channel TEXT NOT NULL DEFAULT 'email',
            subject TEXT,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            sent_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    ");
} catch (PDOException $e) {
    // Table may already exist
}

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Health check
if ($uri === '/health') {
    echo json_encode(['status' => 'ok', 'service' => 'notification-service']);
    exit;
}

// AGENT: Update endpoint path if needed
if ($uri === '/api/notifications' && $method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    exit;
}

if ($uri === '/api/notifications' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $id = sprintf('%s-%s-%s-%s-%s',
        bin2hex(random_bytes(4)), bin2hex(random_bytes(2)),
        bin2hex(random_bytes(2)), bin2hex(random_bytes(2)),
        bin2hex(random_bytes(6)));

    $stmt = $pdo->prepare("
        INSERT INTO notifications (id, recipient, channel, subject, message, status, created_at)
        VALUES (:id, :recipient, :channel, :subject, :message, 'pending', NOW())
    ");
    $stmt->execute([
        ':id' => $id,
        ':recipient' => $data['recipient'] ?? 'user@example.com',
        ':channel' => $data['channel'] ?? 'email',
        ':subject' => $data['subject'] ?? 'Notification',
        ':message' => $data['message'] ?? 'No message provided',
    ]);

    // Simulate sending (mark as sent)
    $pdo->prepare("UPDATE notifications SET status = 'sent', sent_at = NOW() WHERE id = :id")
        ->execute([':id' => $id]);

    http_response_code(201);
    echo json_encode(['id' => $id, 'status' => 'sent']);
    exit;
}

if ($uri === '/api/notifications/stats' && $method === 'GET') {
    $byChannel = $pdo->query("
        SELECT channel, COUNT(*) as count FROM notifications GROUP BY channel ORDER BY count DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    $byStatus = $pdo->query("
        SELECT status, COUNT(*) as count FROM notifications GROUP BY status ORDER BY count DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    $total = $pdo->query("SELECT COUNT(*) FROM notifications")->fetchColumn();

    echo json_encode([
        'total' => (int)$total,
        'by_channel' => $byChannel,
        'by_status' => $byStatus,
    ]);
    exit;
}

if ($uri === '/api/notifications/simulate' && $method === 'POST') {
    $channels = ['email', 'sms', 'push', 'webhook'];
    $count = 10;
    for ($i = 0; $i < $count; $i++) {
        $id = sprintf('%s-%s-%s-%s-%s',
            bin2hex(random_bytes(4)), bin2hex(random_bytes(2)),
            bin2hex(random_bytes(2)), bin2hex(random_bytes(2)),
            bin2hex(random_bytes(6)));
        $channel = $channels[array_rand($channels)];
        $stmt = $pdo->prepare("
            INSERT INTO notifications (id, recipient, channel, subject, message, status, sent_at, created_at)
            VALUES (:id, :recipient, :channel, :subject, :message, 'sent', NOW(), NOW())
        ");
        $stmt->execute([
            ':id' => $id,
            ':recipient' => "user_$i@example.com",
            ':channel' => $channel,
            ':subject' => "Alert #$i",
            ':message' => "Simulated notification $i via $channel",
        ]);
    }
    echo json_encode(['generated' => $count]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found']);
