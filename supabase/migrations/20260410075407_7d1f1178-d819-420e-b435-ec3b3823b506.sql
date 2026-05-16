CREATE POLICY "Anon can check own pending payments for dedup"
ON public.pending_online_payments
FOR SELECT
TO anon, authenticated
USING (true);