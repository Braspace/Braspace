package main

import (
	"context"
	"encoding/json"
	"testing"
)

// migrate sem nada a aplicar deve serializar como [] e nunca como null.
func TestMigrateNothingToApplyEncodesEmptyArray(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	if _, err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	applied, err := migrate(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(applied)
	if string(b) != "[]" {
		t.Fatalf("segunda migracao imprime %s, esperado []", b)
	}
}
