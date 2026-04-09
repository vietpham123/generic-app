package com.genericapp.workorder;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

import javax.annotation.PostConstruct;
import java.util.*;

@SpringBootApplication
@RestController
public class Application {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private RabbitTemplate rabbit;

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    // AGENT: Customize work order schema for industry domain
    @PostConstruct
    public void initDb() {
        try {
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS work_orders (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    title TEXT NOT NULL,
                    assignee TEXT,
                    priority TEXT NOT NULL DEFAULT 'medium',
                    status TEXT NOT NULL DEFAULT 'pending',
                    due_date TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """);
            System.out.println("Work orders table initialized");
        } catch (Exception e) {
            System.err.println("DB init error: " + e.getMessage());
        }
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "work-order-service");
    }

    // AGENT: Update endpoint path (e.g., /api/work-orders)
    @GetMapping("/api/work-orders")
    public List<Map<String, Object>> getAll(@RequestParam(defaultValue = "all") String status) {
        if ("all".equals(status)) {
            return jdbc.queryForList("SELECT * FROM work_orders ORDER BY created_at DESC LIMIT 100");
        }
        return jdbc.queryForList(
            "SELECT * FROM work_orders WHERE status = ? ORDER BY created_at DESC LIMIT 100", status);
    }

    @PostMapping("/api/work-orders")
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String id = UUID.randomUUID().toString();
        jdbc.update(
            "INSERT INTO work_orders (id, title, assignee, priority, status, due_date, created_at) VALUES (?::uuid, ?, ?, ?, 'pending', NOW() + INTERVAL '3 days', NOW())",
            id,
            body.getOrDefault("title", "New Work Order"),
            body.getOrDefault("assignee", "unassigned"),
            body.getOrDefault("priority", "medium")
        );

        // Publish to RabbitMQ for dispatch-service
        try {
            rabbit.convertAndSend("work-orders", "work-order.created",
                String.format("{\"id\":\"%s\",\"priority\":\"%s\"}", id, body.getOrDefault("priority", "medium")));
        } catch (Exception e) {
            System.err.println("RabbitMQ publish error: " + e.getMessage());
        }

        return Map.of("id", id, "status", "created");
    }

    @PutMapping("/api/work-orders/{id}/status")
    public Map<String, Object> updateStatus(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String newStatus = (String) body.getOrDefault("status", "pending");
        int updated = jdbc.update("UPDATE work_orders SET status = ? WHERE id = ?::uuid", newStatus, id);
        if (updated == 0) return Map.of("error", "not found");
        return Map.of("id", id, "status", newStatus);
    }

    @GetMapping("/api/work-orders/stats")
    public Map<String, Object> stats() {
        Map<String, Object> result = new HashMap<>();
        result.put("by_status", jdbc.queryForList(
            "SELECT status, COUNT(*) as count FROM work_orders GROUP BY status"));
        result.put("by_priority", jdbc.queryForList(
            "SELECT priority, COUNT(*) as count FROM work_orders GROUP BY priority"));
        result.put("overdue", jdbc.queryForObject(
            "SELECT COUNT(*) FROM work_orders WHERE due_date < NOW() AND status NOT IN ('completed', 'cancelled')",
            Long.class));
        return result;
    }

    @RabbitListener(queues = "#{@dispatchQueue}")
    public void onDispatch(String message) {
        System.out.println("Received dispatch message: " + message);
    }

    @org.springframework.context.annotation.Bean
    public org.springframework.amqp.core.Queue dispatchQueue() {
        return new org.springframework.amqp.core.Queue("work-order-service.tasks", true);
    }

    @org.springframework.context.annotation.Bean
    public org.springframework.amqp.core.TopicExchange workOrderExchange() {
        return new org.springframework.amqp.core.TopicExchange("work-orders");
    }
}
