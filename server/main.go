package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Pairing struct {
	ID         string `json:"id"`
	SenderID   string `json:"sender_id"`
	ReceiverID string `json:"receiver_id"`
	Status     string `json:"status"` // "pending", "accepted"
}

type DataItem struct {
	ID         string    `json:"id"`
	SenderID   string    `json:"sender_id"`
	ReceiverID string    `json:"receiver_id"`
	Type       string    `json:"type"` // "text", "file"
	Content    string    `json:"content"` // For text, this is the text. For file, this is filename.
	FilePath   string    `json:"-"`       // Internal path, not sent to client
	CreatedAt  time.Time `json:"created_at"`
}

type Database struct {
	Pairings []Pairing  `json:"pairings"`
	Items    []DataItem `json:"items"`
}

var (
	db     Database
	dbLock sync.RWMutex
	dbFile = "clipsend_db.json"
	dataDir = "clipsend_data"
)

func loadDB() {
	dbLock.Lock()
	defer dbLock.Unlock()

	data, err := os.ReadFile(dbFile)
	if err == nil {
		json.Unmarshal(data, &db)
	} else {
		db = Database{Pairings: []Pairing{}, Items: []DataItem{}}
	}
	os.MkdirAll(dataDir, 0755)
}

func saveDB() {
	dbLock.RLock()
	data, _ := json.MarshalIndent(db, "", "  ")
	dbLock.RUnlock()
	os.WriteFile(dbFile, data, 0644)
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// POST /pair/request
// Body: {"sender_id": "...", "receiver_id": "..."}
func pairRequest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SenderID   string `json:"sender_id"`
		ReceiverID string `json:"receiver_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	dbLock.Lock()
	defer dbLock.Unlock()

	// Check if already paired or pending
	for _, p := range db.Pairings {
		if p.SenderID == req.SenderID && p.ReceiverID == req.ReceiverID {
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	pairing := Pairing{
		ID:         generateID(),
		SenderID:   req.SenderID,
		ReceiverID: req.ReceiverID,
		Status:     "pending",
	}
	db.Pairings = append(db.Pairings, pairing)
	go saveDB()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(pairing)
}

// GET /pair/pending?receiver_id=...
func pairPending(w http.ResponseWriter, r *http.Request) {
	receiverID := r.URL.Query().Get("receiver_id")
	
	dbLock.RLock()
	var pending []Pairing
	for _, p := range db.Pairings {
		if p.ReceiverID == receiverID && p.Status == "pending" {
			pending = append(pending, p)
		}
	}
	dbLock.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pending)
}

// GET /pair/accepted?user_id=...
func pairAccepted(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	
	dbLock.RLock()
	var accepted []Pairing
	for _, p := range db.Pairings {
		if (p.ReceiverID == userID || p.SenderID == userID) && p.Status == "accepted" {
			accepted = append(accepted, p)
		}
	}
	dbLock.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(accepted)
}

// POST /pair/accept
// Body: {"id": "..."}
func pairAccept(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	dbLock.Lock()
	for i, p := range db.Pairings {
		if p.ID == req.ID {
			db.Pairings[i].Status = "accepted"
			break
		}
	}
	dbLock.Unlock()
	go saveDB()

	w.WriteHeader(http.StatusOK)
}

// POST /pair/reject or /pair/delete
// Body: {"id": "..."}
func pairDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	dbLock.Lock()
	var newPairings []Pairing
	for _, p := range db.Pairings {
		if p.ID != req.ID {
			newPairings = append(newPairings, p)
		}
	}
	db.Pairings = newPairings
	dbLock.Unlock()
	go saveDB()

	w.WriteHeader(http.StatusOK)
}

func isPaired(senderID, receiverID string) bool {
	dbLock.RLock()
	defer dbLock.RUnlock()
	for _, p := range db.Pairings {
		if p.SenderID == senderID && p.ReceiverID == receiverID && p.Status == "accepted" {
			return true
		}
	}
	return false
}

// POST /data/send
// Multipart form: sender_id, receiver_id, type ("text" or "file")
// text_content or file upload
func dataSend(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(50 << 20) // 50MB max
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	senderID := r.FormValue("sender_id")
	receiverID := r.FormValue("receiver_id")
	dataType := r.FormValue("type")

	if !isPaired(senderID, receiverID) {
		http.Error(w, "Not paired", http.StatusForbidden)
		return
	}

	item := DataItem{
		ID:         generateID(),
		SenderID:   senderID,
		ReceiverID: receiverID,
		Type:       dataType,
		CreatedAt:  time.Now(),
	}

	if dataType == "text" {
		item.Content = r.FormValue("text_content")
	} else if dataType == "file" {
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()

		item.Content = header.Filename
		item.FilePath = filepath.Join(dataDir, item.ID+"_"+header.Filename)

		dst, err := os.Create(item.FilePath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer dst.Close()
		io.Copy(dst, file)
	} else {
		http.Error(w, "Invalid type", http.StatusBadRequest)
		return
	}

	dbLock.Lock()
	db.Items = append(db.Items, item)
	dbLock.Unlock()
	go saveDB()

	w.WriteHeader(http.StatusOK)
}

// GET /data/list?receiver_id=...
func dataList(w http.ResponseWriter, r *http.Request) {
	receiverID := r.URL.Query().Get("receiver_id")
	
	dbLock.RLock()
	var items []DataItem
	for _, item := range db.Items {
		if item.ReceiverID == receiverID {
			items = append(items, item)
		}
	}
	dbLock.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// GET /data/download?id=...
func dataDownload(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")

	dbLock.RLock()
	var found *DataItem
	for _, item := range db.Items {
		if item.ID == id {
			found = &item
			break
		}
	}
	dbLock.RUnlock()

	if found == nil || found.Type != "file" {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	http.ServeFile(w, r, found.FilePath)
}

// POST /data/ack
// Body: {"id": "..."}
func dataAck(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	dbLock.Lock()
	var newItems []DataItem
	var toDelete string
	for _, item := range db.Items {
		if item.ID != req.ID {
			newItems = append(newItems, item)
		} else if item.Type == "file" {
			toDelete = item.FilePath
		}
	}
	db.Items = newItems
	dbLock.Unlock()

	if toDelete != "" {
		os.Remove(toDelete)
	}
	go saveDB()

	w.WriteHeader(http.StatusOK)
}

func main() {
	loadDB()

	http.HandleFunc("/pair/request", corsMiddleware(pairRequest))
	http.HandleFunc("/pair/pending", corsMiddleware(pairPending))
	http.HandleFunc("/pair/accepted", corsMiddleware(pairAccepted))
	http.HandleFunc("/pair/accept", corsMiddleware(pairAccept))
	http.HandleFunc("/pair/reject", corsMiddleware(pairDelete))
	http.HandleFunc("/pair/delete", corsMiddleware(pairDelete))
	
	http.HandleFunc("/data/send", corsMiddleware(dataSend))
	http.HandleFunc("/data/list", corsMiddleware(dataList))
	http.HandleFunc("/data/download", corsMiddleware(dataDownload))
	http.HandleFunc("/data/ack", corsMiddleware(dataAck))

	port := "8081"
	log.Printf("Server listening on :%s", port)
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Incoming request: %s %s", r.Method, r.URL.Path)
		http.DefaultServeMux.ServeHTTP(w, r)
	})
	
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
