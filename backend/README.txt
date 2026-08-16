STEP 1 — EXPRESS V2 FOUNDATION

1. IMPORTANT SECURITY
   The database credentials and session secret were exposed in source code.
   Change the MySQL password and session secret before deployment.

2. In the backend folder run:
   npm install dotenv zod

3. Copy all files in this package into your backend folder.
   Back up your original server.js, db.js, and middleware/auth.js first.

4. Create backend/.env from .env.example.
   Put your NEW database credentials and a long random SESSION_SECRET in it.
   Do not commit .env to Git.

5. Add this to .gitignore:
   .env

6. Restart the backend:
   npm run dev
   or
   npm start

7. Test:
   GET http://localhost:3001/api/v2/system/health

   Expected:
   {
     "success": true,
     "data": {
       "api": "online",
       "database": "online"
     }
   }

8. Test authenticated endpoint with the existing token:
   GET http://localhost:3001/api/v2/system/me
   Authorization: Bearer YOUR_TOKEN

9. Do not remove old auth, sync, Dexie, or frontend synchronization yet.
