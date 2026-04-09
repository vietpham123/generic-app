package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	_ "github.com/lib/pq"
)

var db *sql.DB

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	connStr := fmt.Sprintf("host=%s port=%s dbname=%s user=%s password=%s sslmode=disable",
		env("DB_HOST", "timescaledb"), env("DB_PORT", "5432"),
		env("DB_NAME", "appdb"), env("DB_USER", "appuser"), env("DB_PASSWORD", "changeme"))

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Printf("DB connection error: %v", err)
	}

	initDB()

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/api/audit", auditHandler)
	http.HandleFunc("/api/audit/log", logEntryHandler)

	port := env("PORT", "8085")
	log.Printf("audit-service listening on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func initDB() {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS audit_log (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			actor TEXT NOT NULL,
			action TEXT NOT NULL,
			resource_type TEXT NOT NULL,
			resource_id TEXT,
			details JSONB DEFAULT '{}',
			ip_address TEXT,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		log.Printf("DB init error: %v", err)
	} else {
		log.Println("Audit log table initialized")
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok", "service": "audit-service"})
}

func auditHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		rows, err := db.Query(`
			SELECT id, actor, action, resource_type, resource_id, details, ip_address, created_at
			FROM audit_log ORDER BY created_at DESC LIMIT 100
		`)
		if err != nil {
			writeJSON(w, []interface{}{})
			return
		}
		defer rows.Close()

		var results []map[string]interface{}
		for rows.Next() {
			var id, actor, action, resType string
			var resID, ipAddr sql.NullString
			var details []byte
			var createdAt string
			if err := rows.Scan(&id, &actor, &action, &resType, &resID, &details, &ipAddr, &createdAt); err == nil {
				entry := map[string]interface{}{
					"id":            id,
					"actor":         actor,
					"action":        action,
					"resource_type": resType,
					"resource_id":   resID.String,
					"ip_address":    ipAddr.String,
					"created_at":    createdAt,
				}
				var det interface{}
				if json.Unmarshal(details, &det) == nil {
					entry["details"] = det
				}
				results = append(results, entry)
			}
		}
		if results == nil {
			results = []map[string]interface{}{}
		}
		writeJSON(w, results)
		return
	}
	http.Error(w, "Method not allowed", 405)
}

func logEntryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", 405)
		return
	}

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", 400)
		return
	}

	detailsBytes, _ := json.Marshal(body["details"])
	_, err := db.Exec(`
		INSERT INTO audit_log (actor, action, resource_type, resource_id, details, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6)
	`,
		body["actor"], body["action"], body["resource_type"],
		body["resource_id"], string(detailsBytes), r.RemoteAddr,
	)
	if err != nil {
		w.WriteHeader(500)
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(201)
	writeJSON(w, map[string]string{"status": "logged"})
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
