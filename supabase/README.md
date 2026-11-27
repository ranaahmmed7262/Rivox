# RIVOX backend setup

RIVOX needs its own Supabase project. Do not connect it to the Amar Shopping database.

## 1. Create a dedicated Supabase project
Create a new project named `rivox` in an organization you control. Choose a region close to your primary users.

## 2. Create the first database schema
Open the new project's SQL Editor and run the complete contents of [schema.sql](./schema.sql). The schema enables Row Level Security on every public table and restricts chat data to conversation members.

## 3. Configure the Android app
Copy [../.env.example](../.env.example) to `.env`. From the Supabase project's Connect dialog, copy the Project URL and the Publishable key into the two environment variables. Never put a service-role or secret key in the mobile app.

## 4. Remaining implementation
The app still needs the Supabase client and auth screens wired into the Expo app, then message realtime subscriptions, call signaling, WebRTC, TURN credentials, and incoming-call notifications. Database tables alone do not enable calling.
