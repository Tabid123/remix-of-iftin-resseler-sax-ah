DELETE FROM public.ussd_flow_steps WHERE flow_id = '00ba757f-cc74-4def-a45b-0f11c7d9730b';

INSERT INTO public.ussd_flow_steps (flow_id, step_order, match_keywords, response_template, is_pin_field) VALUES
('00ba757f-cc74-4def-a45b-0f11c7d9730b', 1, ARRAY['dirid','lacag','lacagta','amount','qiime','qiimo','send money','send'], '2', false),
('00ba757f-cc74-4def-a45b-0f11c7d9730b', 2, ARRAY['geli mobile','mobile-ka','mobilka','mobile','lambarka','taleefan','number'], '{receiver}', false),
('00ba757f-cc74-4def-a45b-0f11c7d9730b', 3, ARRAY['hubi mobil','hubi','confirm number','xaqiiji lambarka'], '{receiver}', false),
('00ba757f-cc74-4def-a45b-0f11c7d9730b', 4, ARRAY['geli lacagta','lacagta','amount','qiimaha','enter amount'], '{amount}', false),
('00ba757f-cc74-4def-a45b-0f11c7d9730b', 5, ARRAY['haa','ma hubtaa','confirm','xaqiiji','yes'], '1', false),
('00ba757f-cc74-4def-a45b-0f11c7d9730b', 6, ARRAY['pin','sirta','sir','furaha','password','secret'], '{pin}', true);