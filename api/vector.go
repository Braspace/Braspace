// Optional pgvector metadata retrieval. NEVER used for scientific geometry,
// landing-site ranking or the truth value of a NASA-derived measurement.
// Standard PostgreSQL and embedded mode keep working when this is disabled.
package main

import (
 "bytes"
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "math"
 "mime"
 "net/http"
 "os"
 "regexp"
 "strconv"
 "strings"
 "sync"
 "time"
 "github.com/jackc/pgx/v5/pgxpool"
)

const vectorDimensions = 384
const vectorMaxRequestBytes = 16 << 10

var modelNameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$`)

type vectorSearchRequest struct {
 ModelID string `json:"model_id"`
 Vector []float64 `json:"vector"`
 Limit int `json:"limit"`
}
type vectorHit struct {
 SourceRef string `json:"source_ref"`
 Title string `json:"title"`
 SourceURL string `json:"source_url"`
 SHA256 string `json:"sha256"`
 Similarity float64 `json:"similarity"`
}
type vectorAPI struct { enabled bool; modelID string; pool *pgxpool.Pool; initError error; uri string; mu sync.Mutex; lastDial time.Time }

// vectorLiteral scales by the largest component before normalizing, so tiny
// but valid magnitudes (1e-100) do not underflow to zero in float32 pgvector.
func vectorLiteral(v []float64)(string,error){
 if len(v)!=vectorDimensions{return "",fmt.Errorf("vector must have %d dimensions",vectorDimensions)}
 var maxAbs float64
 for _,x:=range v{
  if math.IsNaN(x)||math.IsInf(x,0)||math.Abs(x)>1e6 {return "",errors.New("vector must be finite and bounded")}
  maxAbs=math.Max(maxAbs,math.Abs(x))
 }
 if maxAbs==0{return "",errors.New("vector norm must be finite and positive")}
 var norm float64
 for _,x:=range v{s:=x/maxAbs;norm+=s*s}
 norm=math.Sqrt(norm)
 parts:=make([]string,len(v))
 for i,x:=range v{parts[i]=strconv.FormatFloat(float64(float32(x/maxAbs/norm)),'g',-1,32)}
 return "["+strings.Join(parts,",")+"]",nil
}

// strictObject reads one JSON object with exact, case-sensitive, unique keys
// (encoding/json alone accepts "LIMIT" and last-write-wins duplicates).
func strictObject(raw []byte, allowed map[string]bool)(map[string]json.RawMessage,error){
 dec:=json.NewDecoder(bytes.NewReader(raw))
 if tok,err:=dec.Token();err!=nil||tok!=json.Delim('{'){return nil,errors.New("expected a JSON object")}
 out:=map[string]json.RawMessage{}
 for dec.More(){
  tok,err:=dec.Token();if err!=nil{return nil,errors.New("invalid JSON payload")}
  k,_:=tok.(string)
  if !allowed[k]{return nil,fmt.Errorf("unknown field %q",k)}
  if _,dup:=out[k];dup{return nil,fmt.Errorf("duplicate field %q",k)}
  var v json.RawMessage
  if err:=dec.Decode(&v);err!=nil{return nil,errors.New("invalid JSON payload")}
  out[k]=v
 }
 if _,err:=dec.Token();err!=nil{return nil,errors.New("invalid JSON payload")}
 if _,err:=dec.Token();err!=io.EOF{return nil,errors.New("trailing JSON payload")}
 return out,nil
}
func parseVectorRequest(r *http.Request)(vectorSearchRequest,string,error){
 var req vectorSearchRequest
 media,_,err:=mime.ParseMediaType(r.Header.Get("Content-Type"))
 if err!=nil||media!="application/json"{return req,"UNSUPPORTED_MEDIA_TYPE",errors.New("application/json required")}
 raw,err:=io.ReadAll(io.LimitReader(r.Body,vectorMaxRequestBytes+1))
 if err!=nil||len(raw)>vectorMaxRequestBytes{return req,"REQUEST_TOO_LARGE",errors.New("body exceeds 16 KiB")}
 obj,err:=strictObject(raw,map[string]bool{"model_id":true,"vector":true,"limit":true})
 if err!=nil{return req,"INVALID_JSON",err}
 if json.Unmarshal(obj["model_id"],&req.ModelID)!=nil||!modelNameRe.MatchString(req.ModelID){return req,"INVALID_MODEL",errors.New("invalid model_id")}
 req.Limit=5
 if l,ok:=obj["limit"];ok{
  n,err:=strconv.Atoi(string(bytes.TrimSpace(l)))
  if err!=nil||n<1||n>10{return req,"INVALID_LIMIT",errors.New("limit must be an integer 1..10")}
  req.Limit=n
 }
 var comps []*float64
 if json.Unmarshal(obj["vector"],&comps)!=nil||comps==nil{return req,"INVALID_VECTOR",errors.New("vector must be an array of numbers")}
 req.Vector=make([]float64,len(comps))
 for i,c:=range comps{
  if c==nil{return req,"INVALID_VECTOR",errors.New("vector components must be numbers, not null")}
  req.Vector[i]=*c
 }
 v,err:=vectorLiteral(req.Vector)
 if err!=nil{return req,"INVALID_VECTOR",err}
 return req,v,nil
}

// Readiness states. Only index_ready serves results; legacy rows (no
// ingest_manifest_sha256, or a manifest that is not the current one for the
// model) stay in the table but are quarantined from public search.
type vectorState struct{
 State string `json:"state"`
 Audited int `json:"audited_count"`
 Legacy int `json:"legacy_unverified_count"`
 OtherModel int `json:"other_model_count"`
 Manifest string `json:"ingest_manifest_sha256,omitempty"`
}
const currentManifestSQL=`(SELECT manifest_sha256 FROM source_semantic_ingest_runs WHERE model_id=$1 ORDER BY last_applied_at DESC, manifest_sha256 LIMIT 1)`

func (v *vectorAPI) diagnose(ctx context.Context)vectorState{
 if !v.enabled{return vectorState{State:"disabled"}}
 pool:=v.getPool(ctx)
 if pool==nil{return vectorState{State:"db_down"}}
 c,cancel:=context.WithTimeout(ctx,2*time.Second);defer cancel()
 if pool.Ping(c)!=nil{return vectorState{State:"db_down"}}
 var schema bool
 if err:=pool.QueryRow(c,`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')
  AND to_regclass('public.source_semantic_ingest_runs') IS NOT NULL
  AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='source_semantic_index' AND column_name='ingest_manifest_sha256')`).Scan(&schema);err!=nil{return vectorState{State:"db_down"}}
 if !schema{return vectorState{State:"schema_unavailable"}}
 var s vectorState
 var man *string
 err:=pool.QueryRow(c,`WITH cur AS `+currentManifestSQL+`
  SELECT (SELECT manifest_sha256 FROM cur),
   count(*) FILTER (WHERE model_id=$1 AND ingest_manifest_sha256=(SELECT manifest_sha256 FROM cur)),
   -- Legacy = same model but NOT audited. A NULL manifest is always legacy: with no ingest run yet,
   -- NULL IS DISTINCT FROM NULL is false and would hide unaudited rows from the quarantine.
   count(*) FILTER (WHERE model_id=$1 AND (ingest_manifest_sha256 IS NULL OR ingest_manifest_sha256 IS DISTINCT FROM (SELECT manifest_sha256 FROM cur))),
   count(*) FILTER (WHERE model_id<>$1)
  FROM source_semantic_index`,v.modelID).Scan(&man,&s.Audited,&s.Legacy,&s.OtherModel)
 if err!=nil{return vectorState{State:"schema_unavailable"}}
 if man!=nil{s.Manifest=strings.TrimSpace(*man)}
 switch{
 case s.Audited>0:s.State="index_ready"
 case s.Legacy>0:s.State="legacy_unverified"
 case s.OtherModel>0:s.State="model_mismatch"
 default:s.State="empty"
 }
 return s
}
// getPool reconnects lazily, so a DB that was down at boot recovers without a restart.
func (v *vectorAPI) getPool(ctx context.Context)*pgxpool.Pool{
 v.mu.Lock();defer v.mu.Unlock()
 if v.pool==nil&&v.uri!=""&&time.Since(v.lastDial)>5*time.Second{
  v.lastDial=time.Now()
  c,cancel:=context.WithTimeout(ctx,2*time.Second);defer cancel()
  v.pool,_=openPool(c,v.uri)
 }
 return v.pool
}
func (v *vectorAPI) ready(ctx context.Context)bool{return v.diagnose(ctx).State=="index_ready"}
func (v *vectorAPI) status(w http.ResponseWriter,r *http.Request){
 s:=v.diagnose(r.Context())
 writeJSON(w,200,map[string]any{
  "enabled":v.enabled,"available":s.State=="index_ready","dimension":vectorDimensions,
  "model_id":v.modelID,"state":s.State,"audited_count":s.Audited,
  "legacy_unverified_count":s.Legacy,"other_model_count":s.OtherModel,
  "ingest_manifest_sha256":s.Manifest,
  "purpose":"provenance-linked metadata retrieval only; never a lunar physics engine",
  "scientifically_validated":false,
 })
}
func (v *vectorAPI) search(w http.ResponseWriter,r *http.Request){
 st:=v.diagnose(r.Context())
 if st.State!="index_ready"{
  writeJSON(w,503,map[string]string{"error":"vector metadata index unavailable or disabled","code":"VECTOR_UNAVAILABLE","state":st.State});return
 }
 req,literal,err:=parseVectorRequest(r)
 if err!=nil{
  code:=http.StatusUnprocessableEntity
  if literal=="UNSUPPORTED_MEDIA_TYPE"{code=415}else if literal=="REQUEST_TOO_LARGE"{code=413}else if literal=="INVALID_JSON"{code=400}
  writeJSON(w,code,map[string]string{"error":err.Error(),"code":literal});return
 }
 if req.ModelID!=v.modelID{
  writeJSON(w,422,map[string]string{"error":"model_id does not match the configured index","code":"MODEL_MISMATCH"});return
 }
 ctx,cancel:=context.WithTimeout(r.Context(),3*time.Second);defer cancel()
 rows,err:=v.pool.Query(ctx,`WITH cur AS `+strings.Replace(currentManifestSQL,"$1","$2",1)+`
  SELECT s.source_ref, s.title, s.source_url, s.sha256, (1 - (s.embedding <=> $1::vector))::float8
  FROM source_semantic_index s JOIN cur ON s.ingest_manifest_sha256=cur.manifest_sha256
  WHERE s.model_id=$2 AND public.vector_norm(s.embedding)>0
  ORDER BY s.embedding <=> $1::vector, s.source_ref COLLATE "C" LIMIT $3`,literal,req.ModelID,req.Limit)
 if err!=nil{writeJSON(w,503,map[string]string{"error":"vector query unavailable","code":"VECTOR_UNAVAILABLE"});return}
 defer rows.Close()
 hits:=make([]vectorHit,0)
 for rows.Next(){
  var h vectorHit
  if err:=rows.Scan(&h.SourceRef,&h.Title,&h.SourceURL,&h.SHA256,&h.Similarity);err!=nil{
   writeJSON(w,503,map[string]string{"error":"vector row unavailable","code":"VECTOR_UNAVAILABLE"});return
  }
  if !strings.HasPrefix(h.SourceURL,"https://")||len(h.SHA256)!=64||!finite(h.Similarity){
   writeJSON(w,503,map[string]string{"error":"untrusted vector source metadata","code":"VECTOR_UNAVAILABLE"});return
  }
  hits=append(hits,h)
 }
 if rows.Err()!=nil{writeJSON(w,503,map[string]string{"error":"vector query interrupted","code":"VECTOR_UNAVAILABLE"});return}
 writeJSON(w,200,map[string]any{"model_id":v.modelID,"dimension":vectorDimensions,"results":hits,
  "ingest_manifest_sha256":st.Manifest,
  "scientifically_validated":false,"limitations":[]string{"Similarity concerns source metadata only; not Sun/Earth geometry, terrain or mission validity.","Only rows from the current audited ingest manifest are returned; legacy rows are quarantined."}})
}
func registerVectorAPI(mux *http.ServeMux){
 api:=&vectorAPI{enabled:os.Getenv("BRASPACE_VECTOR_ENABLED")=="1",modelID:os.Getenv("BRASPACE_VECTOR_MODEL_ID")}
 if api.enabled {
  if !modelNameRe.MatchString(api.modelID){api.enabled=false;api.initError=errors.New("invalid BRASPACE_VECTOR_MODEL_ID")}
  if api.enabled{
   uri:=os.Getenv("VECTOR_DATABASE_URL");if uri==""{uri=os.Getenv("DATABASE_URL")}
   if uri==""{api.initError=errors.New("vector URL missing")}
   api.uri=uri
   if uri!=""{
    ctx,cancel:=context.WithTimeout(context.Background(),3*time.Second)
    api.pool,api.initError=openPool(ctx,uri)
    cancel()
   }
  }
 }
 mux.HandleFunc("GET /api/vector/status",api.status)
 mux.HandleFunc("POST /api/vector/search",api.search)
}
