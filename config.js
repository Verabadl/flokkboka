// Flokkboka – tilkobling til Supabase.
// Finn verdiene i Supabase: Project Settings -> API.
// "anon public"-nøkkelen er laget for å ligge i nettleseren; tilgangen styres av
// radnivåsikkerheten i supabase/schema.sql. Legg ALDRI inn service_role-nøkkelen her.
window.FLOKKBOKA_CONFIG = {
  supabaseUrl: "https://grffizjgiuumsdtwsfvj.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZmZpempnaXV1bXNkdHdzZnZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MjA2MDYsImV4cCI6MjEwOTM5NjYwNn0.5-oGpk5JJjGERy51lKUQMc9mT8cdq-6pJZ1t95RlrkY"
  // Grenser for målerne i superadmin-oversikten (MB). Standard tilsvarer Supabase Free.
  // Juster etter abonnementet ditt (f.eks. Pro: databaseMB 8192, lagringMB 102400).
  grenser: { databaseMB: 8192, lagringMB: 102400 }
};
