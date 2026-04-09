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

	http.HandleFunc("/health", healthHandler)
	// AGENT: Update endpoint paths and metrics for industry-specific analytics
	http.HandleFunc("/api/analytics/dashboard", dashboardHandler)
	http.HandleFunc("/api/analytics/trends", trendsHandler)
	http.HandleFunc("/api/analytics/regions", regionsHandler)

	port := env("PORT", "8082")
	log.Printf("analytics-service listening on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok", "service": "analytics-service"})
}

// AGENT: Customize dashboard KPIs to match industry.yaml kpis section
func dashboardHandler(w http.ResponseWriter, r *http.Request) {
	dashboard := map[string]interface{}{}

	// Active incidents
	var activeIncidents int64
	if err := db.QueryRow("SELECT COUNT(*) FROM incidents WHERE status IN ('open','investigating')").Scan(&activeIncidents); err == nil {
		dashboard["active_incidents"] = activeIncidents
	} else {
		dashboard["active_incidents"] = 0
	}

	// Readings per hour
	var readingsPerHour int64
	if err := db.QueryRow("SELECT COUNT(*) FROM readings WHERE recorded_at > NOW() - INTERVAL '1 hour'").Scan(&readingsPerHour); err == nil {
		dashboard["readings_per_hour"] = readingsPerHour
	} else {
		dashboard["readings_per_hour"] = 0
	}

	// Asset uptime percentage
	var totalAssets, activeAssets int64
	db.QueryRow("SELECT COUNT(*) FROM assets").Scan(&totalAssets)
	db.QueryRow("SELECT COUNT(*) FROM assets WHERE status = 'active'").Scan(&activeAssets)
	if totalAssets > 0 {
		dashboard["asset_uptime_pct"] = float64(activeAssets) / float64(totalAssets) * 100
	} else {
		dashboard["asset_uptime_pct"] = 100.0
	}

	// Open work orders
	var openWO int64
	if err := db.QueryRow("SELECT COUNT(*) FROM work_orders WHERE status NOT IN ('completed','cancelled')").Scan(&openWO); err == nil {
		dashboard["open_work_orders"] = openWO
	} else {
		dashboard["open_work_orders"] = 0
	}

	// Forecast accuracy (mock)
	dashboard["forecast_accuracy_pct"] = 87.5

	// Average response time (mock calculation)
	var avgResp float64
	if err := db.QueryRow(`
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM COALESCE(resolved_at, NOW()) - created_at) / 60), 0)
		FROM incidents WHERE created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&avgResp); err == nil {
		dashboard["avg_response_minutes"] = avgResp
	} else {
		dashboard["avg_response_minutes"] = 0
	}

	writeJSON(w, dashboard)
}

func trendsHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT time_bucket('1 hour', created_at) AS bucket,
		       COUNT(*) AS count
		FROM incidents
		WHERE created_at > NOW() - INTERVAL '24 hours'
		GROUP BY bucket
		ORDER BY bucket
	`)
	if err != nil {
		writeJSON(w, []interface{}{})
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var bucket string
		var count int64
		if err := rows.Scan(&bucket, &count); err == nil {
			results = append(results, map[string]interface{}{
				"time":  bucket,
				"count": count,
			})
		}
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	writeJSON(w, results)
}

func regionsHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT region, COUNT(*) AS total,
		       SUM(CASE WHEN status IN ('open','investigating') THEN 1 ELSE 0 END) AS active,
		       AVG(affected_count) AS avg_affected
		FROM incidents
		WHERE created_at > NOW() - INTERVAL '7 days'
		GROUP BY region ORDER BY total DESC
	`)
	if err != nil {
		writeJSON(w, []interface{}{})
		return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var region string
		var total, active int64
		var avgAffected float64
		if err := rows.Scan(&region, &total, &active, &avgAffected); err == nil {
			results = append(results, map[string]interface{}{
				"region":       region,
				"total":        total,
				"active":       active,
				"avg_affected": avgAffected,
			})
		}
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	writeJSON(w, results)
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
