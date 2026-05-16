-- Reset Somnet USSD flow steps to use specific, non-conflicting keywords.
-- The previous keywords ("1", "2", duplicate "number") matched too broadly,
-- causing the wrong menu navigation and PIN being typed into wrong fields,
-- which made Somnet respond with "Invalid PIN format".

DELETE FROM public.ussd_flow_steps
WHERE flow_id = 'a0204e0c-f82e-464a-93ae-eb901422ec39';

-- Step 1: First Somnet menu (select "Buy data" / equivalent) — typed as menu option
INSERT INTO public.ussd_flow_steps (flow_id, step_order, match_keywords, response_template, is_pin_field) VALUES
('a0204e0c-f82e-464a-93ae-eb901422ec39', 1,
 ARRAY['sii wad','continue','data','internet','buy','iibso','xulo','select','menu','option'],
 '2', false);

-- Step 2: Receiver number prompt
INSERT INTO public.ussd_flow_steps (flow_id, step_order, match_keywords, response_template, is_pin_field) VALUES
('a0204e0c-f82e-464a-93ae-eb901422ec39', 2,
 ARRAY['lambar','number','phone','raac','reciver','receiver','telefoon','geli'],
 '{receiver}', false);

-- Step 3: Amount prompt
INSERT INTO public.ussd_flow_steps (flow_id, step_order, match_keywords, response_template, is_pin_field) VALUES
('a0204e0c-f82e-464a-93ae-eb901422ec39', 3,
 ARRAY['qiimo','lacag','amount','mount','dollar','wadarta','total'],
 '{amount}', false);

-- Step 4: PIN prompt — last step, marked as PIN field (Android guard prevents re-entry)
INSERT INTO public.ussd_flow_steps (flow_id, step_order, match_keywords, response_template, is_pin_field) VALUES
('a0204e0c-f82e-464a-93ae-eb901422ec39', 4,
 ARRAY['pin','furaha','sirta','password','secret','enter pin','geli pin'],
 '{pin}', true);

-- Step 5: Confirmation prompt (often "Press 1 to confirm")
INSERT INTO public.ussd_flow_steps (flow_id, step_order, match_keywords, response_template, is_pin_field) VALUES
('a0204e0c-f82e-464a-93ae-eb901422ec39', 5,
 ARRAY['confirm','xaqiijinta','xaqiiji','press 1','riix 1','riix','accept','ogolow'],
 '1', false);