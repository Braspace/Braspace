# Mission Computer shell (BR31)

New files only; web/index.html, app.js, moon3d.js untouched.
Preview: BRASPACE_API_URL=http://127.0.0.1:8080 node web/dashboard/serve.mjs (port 5180)
Test: node --test web/dashboard/tests/
Every number comes from /api/compare and /api/onboard/site-evaluate; absent = em dash.
Fuel does not exist in the API: panel shows energy/battery (Wh), oxygen and food (kg).
