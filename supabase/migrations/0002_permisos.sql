-- =====================================================================
-- Permisos para usuarios logueados.
-- Los proyectos nuevos de Supabase ya no dan permisos automáticos sobre
-- las tablas creadas por SQL, y sin esto aparece "permission denied".
-- Los datos siguen protegidos por RLS: solo acceden usuarios logueados.
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- El público (sin login) no tiene acceso a nada
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
