package com.genericapp.dispatch

import org.springframework.amqp.rabbit.annotation.RabbitListener
import org.springframework.amqp.rabbit.core.RabbitTemplate
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
import java.util.UUID
import javax.annotation.PostConstruct

@SpringBootApplication
@RestController
class Application(
    private val jdbc: JdbcTemplate,
    private val rabbit: RabbitTemplate
) {
    // AGENT: Customize dispatch table for industry-specific resource assignment
    @PostConstruct
    fun initDb() {
        try {
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS dispatch_assignments (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    work_order_id UUID,
                    assignee TEXT NOT NULL,
                    team TEXT,
                    status TEXT NOT NULL DEFAULT 'assigned',
                    priority TEXT NOT NULL DEFAULT 'medium',
                    eta TIMESTAMPTZ,
                    dispatched_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            println("Dispatch assignments table initialized")
        } catch (e: Exception) {
            println("DB init error: ${e.message}")
        }
    }

    @GetMapping("/health")
    fun health() = mapOf("status" to "ok", "service" to "dispatch-service")

    // AGENT: Update endpoint path (e.g., /api/crew-dispatch)
    @GetMapping("/api/dispatch")
    fun getAll(@RequestParam(defaultValue = "all") status: String): List<Map<String, Any>> {
        return if (status == "all") {
            jdbc.queryForList("SELECT * FROM dispatch_assignments ORDER BY dispatched_at DESC LIMIT 100")
        } else {
            jdbc.queryForList(
                "SELECT * FROM dispatch_assignments WHERE status = ? ORDER BY dispatched_at DESC LIMIT 100",
                status
            )
        }
    }

    @PostMapping("/api/dispatch")
    fun dispatch(@RequestBody body: Map<String, Any>): Map<String, Any> {
        val id = UUID.randomUUID().toString()
        jdbc.update(
            """INSERT INTO dispatch_assignments (id, work_order_id, assignee, team, priority, eta, dispatched_at)
               VALUES (?::uuid, ?::uuid, ?, ?, ?, NOW() + INTERVAL '2 hours', NOW())""",
            id,
            body["work_order_id"]?.toString(),
            body.getOrDefault("assignee", "team-1"),
            body.getOrDefault("team", "default"),
            body.getOrDefault("priority", "medium")
        )
        return mapOf("id" to id, "status" to "dispatched")
    }

    @PutMapping("/api/dispatch/{id}/status")
    fun updateStatus(@PathVariable id: String, @RequestBody body: Map<String, Any>): Map<String, Any> {
        val newStatus = body.getOrDefault("status", "assigned").toString()
        val updated = jdbc.update(
            "UPDATE dispatch_assignments SET status = ? WHERE id = ?::uuid",
            newStatus, id
        )
        return if (updated > 0) mapOf("id" to id, "status" to newStatus)
        else mapOf("error" to "not found")
    }

    @GetMapping("/api/dispatch/stats")
    fun stats(): Map<String, Any> = mapOf(
        "by_status" to jdbc.queryForList(
            "SELECT status, COUNT(*) as count FROM dispatch_assignments GROUP BY status"
        ),
        "by_team" to jdbc.queryForList(
            "SELECT team, COUNT(*) as count FROM dispatch_assignments GROUP BY team"
        ),
        "active" to (jdbc.queryForObject(
            "SELECT COUNT(*) FROM dispatch_assignments WHERE status NOT IN ('completed', 'cancelled')",
            Long::class.java
        ) ?: 0L)
    )

    // Listen for new work orders from RabbitMQ
    @RabbitListener(queues = ["dispatch-service.tasks"])
    fun onWorkOrder(message: String) {
        println("Received work order for dispatch: $message")
    }
}

fun main(args: Array<String>) {
    runApplication<Application>(*args)
}
