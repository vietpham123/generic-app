package com.genericapp.ingestion;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

import javax.annotation.PostConstruct;
import java.util.*;

@SpringBootApplication
@EnableScheduling
@RestController
public class Application {

    @Autowired
    private JdbcTemplate jdbc;

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    // AGENT: Customize table schema for domain-specific batch data
    @PostConstruct
    public void initDb() {
        try {
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS ingested_data (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    source TEXT NOT NULL,
                    payload JSONB NOT NULL DEFAULT '{}',
                    batch_id TEXT,
                    processed BOOLEAN DEFAULT FALSE,
                    ingested_at TIMESTAMPTZ DEFAULT NOW()
                )
            """);
            System.out.println("Ingested data table initialized");
        } catch (Exception e) {
            System.err.println("DB init error: " + e.getMessage());
        }
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "data-ingestion-service");
    }

    // AGENT: Update endpoint path (e.g., /api/meter-data)
    @GetMapping("/api/ingestion")
    public List<Map<String, Object>> getAll() {
        return jdbc.queryForList(
            "SELECT * FROM ingested_data ORDER BY ingested_at DESC LIMIT 100"
        );
    }

    @GetMapping("/api/ingestion/stats")
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", jdbc.queryForObject("SELECT COUNT(*) FROM ingested_data", Long.class));
        stats.put("unprocessed", jdbc.queryForObject(
            "SELECT COUNT(*) FROM ingested_data WHERE processed = FALSE", Long.class));
        stats.put("sources", jdbc.queryForList(
            "SELECT source, COUNT(*) as count FROM ingested_data GROUP BY source ORDER BY count DESC"));
        return stats;
    }

    @PostMapping("/api/ingestion")
    public Map<String, Object> ingest(@RequestBody Map<String, Object> body) {
        String id = UUID.randomUUID().toString();
        String source = (String) body.getOrDefault("source", "manual");
        jdbc.update(
            "INSERT INTO ingested_data (id, source, payload, batch_id, ingested_at) VALUES (?::uuid, ?, ?::jsonb, ?, NOW())",
            id, source, "{}", "batch-" + System.currentTimeMillis()
        );
        return Map.of("id", id, "status", "ingested");
    }

    // AGENT: Customize Kafka topic to match industry.yaml entity topic
    @KafkaListener(topics = "${KAFKA_INGEST_TOPIC:generic.reading.created}", groupId = "data-ingestion-service")
    public void onMessage(String message) {
        try {
            jdbc.update(
                "INSERT INTO ingested_data (source, payload, batch_id, ingested_at) VALUES ('kafka', ?::jsonb, ?, NOW())",
                message, "kafka-" + System.currentTimeMillis()
            );
        } catch (Exception e) {
            System.err.println("Kafka ingest error: " + e.getMessage());
        }
    }

    // Background: process unprocessed records every 30s
    @Scheduled(fixedRate = 30000)
    public void processRecords() {
        try {
            int updated = jdbc.update(
                "UPDATE ingested_data SET processed = TRUE WHERE processed = FALSE AND ingested_at < NOW() - INTERVAL '10 seconds'"
            );
            if (updated > 0) System.out.println("Processed " + updated + " records");
        } catch (Exception e) {
            System.err.println("Processing error: " + e.getMessage());
        }
    }
}
