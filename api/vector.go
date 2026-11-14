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
type vectorAPI struct { enabled bool; modelID string; pool *pgxpool.Pool; initError error }

func vectorLiteral(v []float64)(string,error){
 if len(v)!=vectorDimensions{return "",fmt.Errorf("vector must have %d dimensions",vectorDimensions)}
 var norm float64
 parts:=make([]string,len(v))
 for i,x:=range v{
  if math.IsNaN(x)||math.IsInf(x,0)||math.Abs(x)>1e6 {return "",errors.New("vector must be finite and bounded")}
  norm+=x*x
  parts[i]=strconv.FormatFloat(x,'g',12,64)
 }
 if !finite(norm)||norm<=0{return "",errors.New("vector norm must be finite and positive")}
 return "["+strings.Join(parts,",")+"]",nil
}
func parseVectorRequest(r *http.Request)(vectorSearchRequest,string,error){
 var req vectorSearchRequest
 media,_,err:=mime.ParseMediaType(r.Header.Get("Content-Type"))
 if err!=nil||media!="application/json"{return req,"UNSUPPORTED_MEDIA_TYPE",errors.New("application/json required")}
 raw,err:=io.ReadAll(io.LimitReader(r.Body,vectorMaxRequestBytes+1))
 if err!=nil||len(raw)>vectorMaxRequestBytes{return req,"REQUEST_TOO_LARGE",errors.New("body exceeds 16 KiB")}
 dec:=json.NewDecoder(bytes.NewReader(raw));dec.DisallowUnknownFields()
 if err:=dec.Decode(&req);err!=nil{return req,"INVALID_JSON",errors.New("invalid JSON payload")}
 var tail any
 if err:=dec.Decode(&tail);err!=io.EOF{return req,"INVALID_JSON",errors.New("trailing JSON payload")}
 if !modelNameRe.MatchString(req.ModelID){return req,"INVALID_MODEL",errors.New("invalid model_id")}
 if req.Limit==0 {req.Limit=5}
 if req.Limit<1||req.Limit>10 {return req,"INVALID_LIMIT",errors.New("limit must be 1..10")}
 v,err:=vectorLiteral(req.Vector)
 if err!=nil{return req,"INVALID_VECTOR",err}
 return req,v,nil
}
func (v *vectorAPI) ready(ctx context.Context)bool{
 if v.pool==nil{return false}
 c,cancel:=context.WithTimeout(ctx,2*time.Second);defer cancel()
 var ok bool
 err:=v.pool.QueryRow(c,`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector') AND to_regclass('public.source_semantic_index') IS NOT NULL`).Scan(&ok)
 return err==nil&&ok
}
func (v *vectorAPI) status(w http.ResponseWriter,r *http.Request){
 ready:=v.enabled&&v.ready(r.Context())
 writeJSON(w,200,map[string]any{
  "enabled":v.enabled,"available":ready,"dimension":vectorDimensions,
  "model_id":v.modelID,
  "purpose":"provenance-linked metadata retrieval only; never a lunar physics engine",
  "scientifically_validated":false,
 })
}
func (v *vectorAPI) search(w http.ResponseWriter,r *http.Request){
 if !v.enabled||!v.ready(r.Context()){
  writeJSON(w,503,map[string]string{"error":"vector metadata index unavailable or disabled","code":"VECTOR_UNAVAILABLE"});return
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
 rows,err:=v.pool.Query(ctx,`SELECT source_ref, title, source_url, sha256, (1 - (embedding <=> $1::vector))::float8
  FROM source_semantic_index WHERE model_id=$2
  ORDER BY embedding <=> $1::vector LIMIT $3`,literal,req.ModelID,req.Limit)
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
  "scientifically_validated":false,"limitations":[]string{"Similarity concerns source metadata only; not Sun/Earth geometry, terrain or mission validity."}})
}
func registerVectorAPI(mux *http.ServeMux){
 api:=&vectorAPI{enabled:os.Getenv("BRASPACE_VECTOR_ENABLED")=="1",modelID:os.Getenv("BRASPACE_VECTOR_MODEL_ID")}
 if api.enabled {
  if !modelNameRe.MatchString(api.modelID){api.enabled=false;api.initError=errors.New("invalid BRASPACE_VECTOR_MODEL_ID")}
  if api.enabled{
   uri:=os.Getenv("VECTOR_DATABASE_URL");if uri==""{uri=os.Getenv("DATABASE_URL")}
   if uri==""{api.initError=errors.New("vector URL missing")}
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
